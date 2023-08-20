import getConfigStore from "db/config";
import { MsgType } from "db/enums";
import { Client as DBClient, withDBClient } from "db/index";
import { norm } from "./vectools";
import { input2log } from "./utils";
import { ChatHistoryInputLine } from "./llm/base";

const LOOKBEHIND_LIMIT = 4;

export interface MatchDialogueChatHistoryEntry {
  id: string;
  msg_type: MsgType;
  content: string;
  embedding: number[];
  matched_dialogue_items?: string[];
  matched_item_scores?: number[];
  best_phrasing?: string[];
}

export type SampleInputLine = ChatHistoryInputLine | "---";

export interface MatchDialogueResult {
  item_matches: ItemMatchResult[];
  direct_result: boolean;
  model_sample_input: SampleInputLine[];
}

export interface CachedPhrasing {
  arr_idx: number;
  item: CachedDialogueItem;

  phrasing_id: string;
  is_counter: boolean;
  q_tokens: number;
}

export interface CachedDialogueItem {
  arr_idx: number;
  dialogue_item_id: string;
  dialogue_group_id: string;
  ignore_for_first_match: boolean;
  parent: CachedDialogueItem | null;
  canonical_phrasing: CachedPhrasing;
  response_tokens: number;
}

export interface BatchSimilarityResult {
  ranked_phrasings: CachedPhrasing[];
  scores: Float32Array;
}

export interface ItemMatchResult {
  item: CachedDialogueItem;
  best_phrasing: CachedPhrasing;
  score: number;
};

export interface ItemsMatchTree {
  max_score: number;
  this_item: CachedDialogueItem;
  selected_phrasing: CachedPhrasing;
  children: ItemsMatchTree[];
}

export interface ReconstructedItemMatchResult extends ItemMatchResult {
  missing_phrasing_id?: string;
}

export interface ReconstructItemMatchesResult {
  item_matches: ReconstructedItemMatchResult[];
  missing_items: string[];
}

export class DialogueMatcher {
  private phrasings: CachedPhrasing[];
  private embeddings_buf: Float32Array;
  private dialogue_items: CachedDialogueItem[];
  private item_id_map: Map<string, CachedDialogueItem>;

  private constructor(
    private embedding_dim: number,
    private nb_phrasings: number,
  ) {
    this.embeddings_buf = new Float32Array(embedding_dim * nb_phrasings);
    this.phrasings = new Array(nb_phrasings);
    this.dialogue_items = [];
    this.item_id_map = new Map();
  }

  private storePhrasingEmbedding(embedding: number[], idx: number) {
    if (embedding.length != this.embedding_dim) {
      throw new Error(`Expected embedding of length ${this.embedding_dim}, got ${embedding.length}`);
    }
    if (idx >= this.nb_phrasings) {
      throw new Error(`Invalid index ${idx}`);
    }
    let n = norm(embedding);
    if (Math.abs(n - 1) < 1e-8) {
      n = 1;
    }
    for (let i = 0; i < this.embedding_dim; i++) {
      this.embeddings_buf[idx * this.embedding_dim + i] = embedding[i] / n;
    }
  }

  batchSimilarity(embedding: number[] | Float32Array): BatchSimilarityResult {
    let scores = new Float32Array(this.nb_phrasings);
    for (let i = 0; i < this.nb_phrasings; i += 1) {
      scores[i] = 0;
      for (let j = 0; j < this.embedding_dim; j += 1) {
        scores[i] += embedding[j] * this.embeddings_buf[i * this.embedding_dim + j];
      }
    }
    let ranked_phrasings = this.phrasings.slice();
    ranked_phrasings.sort((a, b) => scores[b.arr_idx] - scores[a.arr_idx]);
    let ranked_scores = new Float32Array(this.nb_phrasings);
    for (let i = 0; i < this.nb_phrasings; i += 1) {
      ranked_scores[i] = scores[ranked_phrasings[i].arr_idx];
    }
    return {
      ranked_phrasings, scores: ranked_scores
    };
  }

  /**
   * Return matched items from best to worst.
   */
  groupIntoItems({ ranked_phrasings, scores: phrasing_scores }: BatchSimilarityResult): ItemMatchResult[] {
    // TODO: handle ignore_for_first_match
    let item_ranked = new Uint8Array(this.dialogue_items.length);
    for (let i = 0; i < item_ranked.length; i += 1) {
      item_ranked[i] = 0;
    }

    let res: ItemMatchResult[] = [];

    for (let i = 0; i < ranked_phrasings.length; i += 1) {
      let phrasing = ranked_phrasings[i];
      let phrasing_score = phrasing_scores[i];
      let item_idx = phrasing.item.arr_idx;
      if (item_ranked[item_idx]) {
        continue;
      }
      item_ranked[item_idx] = 1;

      if (!phrasing.is_counter) {
        res.push({
          item: phrasing.item,
          best_phrasing: phrasing,
          score: phrasing_score
        });
      }
    }

    return res;
  }

  doLookBehind(message_history: MatchDialogueChatHistoryEntry[], item_matches: ItemMatchResult[]) {
    let curr_item_scores = new Map<string, number>();
    for (let item_match of item_matches) {
      curr_item_scores.set(item_match.item.dialogue_item_id, item_match.score);
    }

    let all_parent_scores = new Map<string, number>();
    for (let item_match of item_matches) {
      let item = item_match.item.parent;
      while (item !== null) {
        if (all_parent_scores.has(item.dialogue_item_id)) {
          break;
        }
        all_parent_scores.set(item.dialogue_item_id, curr_item_scores.get(item.dialogue_item_id) ?? 0);
        item = item.parent;
      }
    }

    let lookback_i = 0;
    for (let msg of message_history) {
      if (lookback_i >= LOOKBEHIND_LIMIT) {
        break;
      }
      if (msg.msg_type != MsgType.Bot) {
        continue;
      }

      if (msg.matched_dialogue_items?.length > 0 && msg.matched_item_scores?.length > 0) {
        for (let i = 0; i < msg.matched_dialogue_items.length && i < msg.matched_item_scores.length; i += 1) {
          let item_id = msg.matched_dialogue_items[i];
          let score = msg.matched_item_scores[i];
          if (all_parent_scores.has(item_id)) {
            all_parent_scores.set(item_id, Math.max(all_parent_scores.get(item_id), score));
          }
        }
      }

      lookback_i += 1;
    }

    for (let item_match of item_matches) {
      if (item_match.item.parent === null) {
        continue;
      }

      let item = item_match.item.parent;
      let max_parent_score = 0;
      while (item !== null) {
        let score = all_parent_scores.get(item.dialogue_item_id);
        if (score === undefined) {
          throw new Error(`Assertion failed`);
        }
        max_parent_score = Math.max(max_parent_score, score);
        item = item.parent;
      }

      item_match.score = Math.min(item_match.score, max_parent_score);
    }

    item_matches.sort((a, b) => b.score - a.score);
  }

  /**
   * Take a (usually truncated) ranked list of items from best to worst match,
   * and construct the minimum set of dialogue trees that cover all the given
   * items up to the token limit.
   */
  itemsToTrees(item_matches: ItemMatchResult[], token_limit: number): { trees: ItemsMatchTree[], all_nodes: ItemsMatchTree[] } {
    let trees: ItemsMatchTree[] = [];
    let item_id_to_treenode: Map<string, ItemsMatchTree> = new Map();
    let total_tokens = 0;

    function doNode(item: CachedDialogueItem): ItemsMatchTree | null {
      let existing_node = item_id_to_treenode.get(item.dialogue_item_id);
      if (existing_node) {
        return existing_node;
      }

      let this_tokens = item.canonical_phrasing.q_tokens + item.response_tokens;
      if (total_tokens + this_tokens > token_limit) {
        return null;
      }
      total_tokens += this_tokens;

      let node: ItemsMatchTree = {
        this_item: item,
        max_score: 0,
        selected_phrasing: item.canonical_phrasing,
        children: [],
      };
      item_id_to_treenode.set(item.dialogue_item_id, node);

      if (item.parent === null) {
        trees.push(node);
      }

      return node;
    }

    function maybeMatchNodeWithPhrasing(node: ItemsMatchTree, selected_phrasing: CachedPhrasing, score: number): boolean {
      if (node.max_score >= score) {
        return false;
      }
      let new_total_tokens = total_tokens - node.selected_phrasing.q_tokens + selected_phrasing.q_tokens;
      if (new_total_tokens > token_limit) {
        return false;
      }
      total_tokens = new_total_tokens;
      node.max_score = score;
      node.selected_phrasing = selected_phrasing;
      return true;
    }

    outer: for (let { item, best_phrasing, score } of item_matches) {
      let curr_node = doNode(item);
      if (curr_node === null) {
        if (process.env.NODE_ENV === 'development') {
          console.log(`Skipping item ${item.dialogue_item_id} and stopping due to token limit`);
        }
        break;
      }
      if (maybeMatchNodeWithPhrasing(curr_node, best_phrasing, score)) {
        while (curr_node.this_item.parent !== null) {
          let parent_node = doNode(curr_node.this_item.parent);
          if (parent_node === null) {
            if (process.env.NODE_ENV === 'development') {
              console.log(`Skipping item ${curr_node.this_item.parent.dialogue_item_id} and stopping due to token limit`);
            }
            break outer;
          }
          if (!parent_node.children.includes(curr_node)) {
            parent_node.children.push(curr_node);
          }
          parent_node.max_score = Math.max(parent_node.max_score, score);
          curr_node = parent_node;
        }
      }
    }

    for (let node of item_id_to_treenode.values()) {
      node.children.sort((a, b) => b.max_score - a.max_score);
    }

    trees.sort((a, b) => b.max_score - a.max_score);

    return { trees, all_nodes: Array.from(item_id_to_treenode.values()) };
  }

  /**
   * @param message_history The chat history to match against, in reverse order (most recent first)
   */
  async matchDialogue(message_history: MatchDialogueChatHistoryEntry[], sample_token_limit: number, abort: AbortSignal, db?: DBClient): Promise<MatchDialogueResult> {
    if (!db) {
      return await withDBClient(db => this.matchDialogue(message_history, sample_token_limit, abort, db));
    }
    if (message_history.length == 0) {
      throw new Error("Empty message_history");
    }
    const cancelledError = new Error("Cancelled");
    const debug_output = process.env.NODE_ENV === "development";

    let last_msg = message_history[0];
    if (abort.aborted) {
      throw cancelledError;
    }

    let batch_sim = this.batchSimilarity(last_msg.embedding);
    if (debug_output) {
      console.log(`Batch similarity for ${input2log(last_msg.content)}:`)
      for (let i = 0; i < batch_sim.ranked_phrasings.length && i < 5; i += 1) {
        let phr = batch_sim.ranked_phrasings[i];
        let score = batch_sim.scores[i];
        let { rows: [res] } = await db.query({
          text: "select q_text from dialogue_phrasing where id = $1",
          values: [phr.phrasing_id]
        });
        console.log(`  ${score.toFixed(5)}: ${phr.phrasing_id} - ${input2log(res.q_text)}`);
      }
      if (batch_sim.ranked_phrasings.length > 5) {
        console.log(`  ...`);
      }
    }
    if (abort.aborted) {
      throw cancelledError;
    }

    let item_matches = this.groupIntoItems(batch_sim);

    async function debugPrintItemMatches() {
      for (let i = 0; i < item_matches.length && i < 5; i += 1) {
        let item_match = item_matches[i];
        let { rows: [res] } = await db.query({
          text: "select q_text from dialogue_phrasing where id = $1",
          values: [item_match.best_phrasing.phrasing_id]
        });
        console.log(`  ${item_match.score.toFixed(5)}: ${item_match.item.dialogue_item_id} with best phrasing ${input2log(res.q_text)}`);
      }
      if (item_matches.length > 5) {
        console.log(`  ...`);
      }
    }

    if (debug_output) {
      console.log(`Grouped into ${item_matches.length} items:`);
      await debugPrintItemMatches();
    }

    this.doLookBehind(message_history, item_matches);
    if (debug_output) {
      console.log(`After lookbehind:`);
      await debugPrintItemMatches();
    }

    let { trees, all_nodes } = this.itemsToTrees(item_matches, sample_token_limit);
    let model_input: SampleInputLine[] = [];

    let all_phrasing_ids = all_nodes.map(x => x.selected_phrasing.phrasing_id);
    let phrasing_q_text_cache = await this.getPhrasingQTextCache(all_phrasing_ids, db);
    let all_item_ids = all_nodes.map(x => x.this_item.dialogue_item_id);
    let item_response_cache = await this.getResponseTextCache(all_item_ids, db);

    async function dfs(node: ItemsMatchTree) {
      model_input.push({ role: "user", text: phrasing_q_text_cache.get(node.selected_phrasing.phrasing_id) });
      model_input.push({ role: "bot", text: item_response_cache.get(node.this_item.dialogue_item_id) });

      for (let child of node.children) {
        await dfs(child);
      }
    }

    let first = true;
    for (let tree of trees) {
      if (!first) {
        model_input.push("---");
      }
      first = false;
      await dfs(tree);
    }

    if (debug_output) {
      console.log(`Model input:`);
      for (let line of model_input) {
        if (typeof line == "string") {
          console.log(line);
        } else {
          console.log(`  ${line.role}: ${input2log(line.text)}`);
        }
      }
    }

    return {
      item_matches,
      direct_result: false,
      model_sample_input: model_input,
    }
  }

  async getPhrasingQTextCache(phrasing_ids: string[], db: DBClient): Promise<Map<string, string>> {
    let phrasing_q_text_cache = new Map<string, string>();
    let { rows } = await db.query({
      text: "select id, q_text from dialogue_phrasing where id = any($1)",
      values: [phrasing_ids]
    });
    for (let row of rows) {
      phrasing_q_text_cache.set(row.id, row.q_text);
    }
    return phrasing_q_text_cache;
  }

  async getResponseTextCache(item_ids: string[], db: DBClient): Promise<Map<string, string>> {
    let item_response_cache = new Map<string, string>();
    let { rows } = await db.query({
      text: "select item_id, response from dialogue_item where item_id = any($1)",
      values: [item_ids]
    });
    for (let row of rows) {
      item_response_cache.set(row.item_id, row.response);
    }
    return item_response_cache;
  }

  async reconstructItemMatchResults(item_ids: string[], scores: number[], best_phrasing_ids: string[]): Promise<ReconstructItemMatchesResult> {
    if (scores.length == 0) {
      throw new Error("Missing scores");
    }
    if (item_ids.length != scores.length) {
      throw new Error(`Assertion failed: item_ids.length (=${item_ids.length}) != scores.length (=${scores.length})`);
    }
    let res: ReconstructItemMatchesResult = {
      item_matches: [],
      missing_items: [],
    };

    let phrasing_id_map = new Map<string, CachedPhrasing>();
    for (let ph of this.phrasings) {
      phrasing_id_map.set(ph.phrasing_id, ph);
    }

    for (let i = 0; i < item_ids.length; i += 1) {
      let item = this.item_id_map.get(item_ids[i]);
      if (!item) {
        res.missing_items.push(item_ids[i]);
        continue;
      }
      let missing_phrasing_id = undefined;
      let best_phrasing = item.canonical_phrasing;
      if (best_phrasing_ids.length > i) {
        best_phrasing = phrasing_id_map.get(best_phrasing_ids[i]);
        if (!best_phrasing) {
          best_phrasing = item.canonical_phrasing;
          missing_phrasing_id = best_phrasing_ids[i];
        }
      }
      let m: ReconstructedItemMatchResult = {
        item,
        score: scores[i],
        missing_phrasing_id,
        best_phrasing,
      };
      res.item_matches.push(m);
    }

    return res;
  }

  static async fromDatabase(db: DBClient): Promise<DialogueMatcher> {
    const conf_store = await getConfigStore();
    let embedding_model_name = conf_store.embedding_model.model_name;
    let { rows }: { rows: any[] } = await db.query({
      text: `
        select
          emb.embedding as embedding,
          emb.phrasing as phrasing_id,
          p.q_text as q_text,
          p.dialogue_item as item_id,
          p.is_counterexample as is_counter,
          it.ignore_for_first_match as ignore_for_first_match,
          it.dialogue_group as dialogue_group_id,
          it.parent as parent_id,
          it.response as response_text,
          it.canonical_phrasing as canonical_phrasing_id
        from dialogue_phrasing_embedding emb
          inner join dialogue_phrasing p on (p.id = emb.phrasing)
          inner join dialogue_item it on (p.dialogue_item = it.item_id)
        where
          emb.model = $1`,
      values: [embedding_model_name]
    });
    let embedding_dim = 0;
    if (rows.length > 0) {
      embedding_dim = rows[0].embedding.length;
    }
    let next_item_idx = 0;
    let self = new DialogueMatcher(embedding_dim, rows.length);
    let phrasing_map = new Map<string, CachedPhrasing>();

    let set_canonical_phrasing: [CachedDialogueItem, string][] = [];
    let set_parent: [CachedDialogueItem, string][] = [];

    for (let i = 0; i < rows.length; i += 1) {
      let row = rows[i];
      let dialogue_item_obj: CachedDialogueItem;
      if (!self.item_id_map.has(row.item_id)) {
        dialogue_item_obj = {
          arr_idx: next_item_idx++,
          dialogue_item_id: row.item_id,
          dialogue_group_id: row.dialogue_group_id,
          ignore_for_first_match: row.ignore_for_first_match,
          parent: null,
          canonical_phrasing: null,
          response_tokens: await conf_store.generation_model.countTokens(row.response_text, {}),
        };
        self.item_id_map.set(row.item_id, dialogue_item_obj);
        if (row.parent_id !== null) {
          set_parent.push([dialogue_item_obj, row.parent_id]);
        }
        self.dialogue_items.push(dialogue_item_obj);
        if (row.canonical_phrasing_id !== null) {
          set_canonical_phrasing.push([dialogue_item_obj, row.canonical_phrasing_id]);
        }
      } else {
        dialogue_item_obj = self.item_id_map.get(row.item_id);
      }
      let cached_p: CachedPhrasing = {
        arr_idx: i,
        item: dialogue_item_obj,
        phrasing_id: row.phrasing_id,
        is_counter: row.is_counter,
        q_tokens: await conf_store.generation_model.countTokens(row.q_text, {}),
      };
      self.phrasings[i] = cached_p;
      self.storePhrasingEmbedding(row.embedding, i);
      phrasing_map.set(cached_p.phrasing_id, cached_p);
    }

    for (let [item, canon_phr_id] of set_canonical_phrasing) {
      let phr = phrasing_map.get(canon_phr_id);
      if (!phr) {
        throw new Error(`Assertion failed: phrasing ${canon_phr_id} not found`);
      }
      item.canonical_phrasing = phr;
    }

    for (let [item, parent_id] of set_parent) {
      let parent = self.item_id_map.get(parent_id);
      if (!parent) {
        throw new Error(`Assertion failed: parent dialogue item ${parent_id} not found`);
      }
      item.parent = parent;
    }

    if (self.dialogue_items.length != next_item_idx) {
      throw new Error("Assertion failed: dialogue_items.length != next_item_idx");
    }

    console.log(`Created in-memory matcher graph with ${self.dialogue_items.length} items and ${self.phrasings.length} phrasings`);

    return self;
  }
}

let cached_matcher: DialogueMatcher | null = null;

export async function getCachedMatcher(): Promise<DialogueMatcher> {
  if (cached_matcher === null) {
    cached_matcher = await withDBClient(db => DialogueMatcher.fromDatabase(db));
  }
  return cached_matcher;
}

export function deleteCachedMatcher() {
  cached_matcher = null;
}
