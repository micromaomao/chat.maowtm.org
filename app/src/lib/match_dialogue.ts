import getConfigStore from "db/config";
import { MsgType } from "db/enums";
import { Client as DBClient, withDBClient } from "db/index";
import { norm } from "./vectools";

export interface MatchDialogueChatHistoryEntry {
  id: string;
  msg_type: MsgType;
  content: string;
  embedding: number[];
}

export interface MatchDialogueResult {
  matched_phrasings: string[];
  match_scores: number[];
  best_match_dialogue: string | null;
  direct_result: boolean;
}

interface CachedPhrasing {
  arr_idx: number;
  item: CachedDialogueItem;

  phrasing_id: string;
  phrasing_text: string;
  is_counter: boolean;
}

interface CachedDialogueItem {
  arr_idx: number;
  dialogue_item_id: string;
  dialogue_group_id: string;
  ignore_for_first_match: boolean;
  parent_id: string | null;
}

interface BatchSimilarityResult {
  ranked_phrasings: CachedPhrasing[];
  scores: Float32Array;
}

type ItemsMatchResult = {
  item: CachedDialogueItem;
  best_phrasing: CachedPhrasing;
  score: number;
}[];

interface ItemsMatchTree {
  max_score: number;
  this_item: CachedDialogueItem;
  children: ItemsMatchTree[];
}

class DialogueMatcher {
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

  batchSimilarity(embedding: number[] | Float32Array, idx: number): BatchSimilarityResult {
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

  groupIntoItems({ ranked_phrasings, scores: phrasing_scores }: BatchSimilarityResult): ItemsMatchResult {
    // TODO: handle ignore_for_first_match
    let item_ranked = new Uint8Array(this.dialogue_items.length);
    for (let i = 0; i < item_ranked.length; i += 1) {
      item_ranked[i] = 0;
    }

    let res: ItemsMatchResult = [];

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

  itemsToTrees(items: ItemsMatchResult): ItemsMatchTree[] {
    let trees: ItemsMatchTree[] = [];
    if (items.length == 0) {
      return trees;
    }
    throw new Error("Not implemented");
  }

  static async fromDatabase(db: DBClient): Promise<DialogueMatcher> {
    const conf_store = await getConfigStore();
    let embedding_model_name = conf_store.embedding_model.model_name;
    let { rows }: { rows: any[] } = await db.query({
      text: `
        select
          emb.embedding as embedding,
          emb.phrasing as phrasing_id,
          p.q_text as phrasing_text,
          p.dialogue_item as item_id,
          p.is_counterexample as is_counter,
          it.ignore_for_first_match as ignore_for_first_match,
          it.dialogue_group as dialogue_group_id
          it.parent as parent_id
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
    for (let i = 0; i < rows.length; i += 1) {
      let row = rows[i];
      let dialogue_item_obj: CachedDialogueItem;
      if (!self.item_id_map.has(row.item_id)) {
        dialogue_item_obj = {
          arr_idx: next_item_idx++,
          dialogue_item_id: row.item_id,
          dialogue_group_id: row.dialogue_group_id,
          ignore_for_first_match: row.ignore_for_first_match,
          parent_id: row.parent_id
        };
        self.item_id_map.set(row.item_id, dialogue_item_obj);
        self.dialogue_items.push(dialogue_item_obj);
      } else {
        dialogue_item_obj = self.item_id_map.get(row.item_id);
      }
      let cached_p: CachedPhrasing = {
        arr_idx: i,
        item: dialogue_item_obj,
        phrasing_id: row.phrasing_id,
        phrasing_text: row.phrasing_text,
        is_counter: row.is_counter,
      };
      self.phrasings[i] = cached_p;
      self.storePhrasingEmbedding(row.embedding, i);
    }
    if (self.dialogue_items.length != next_item_idx) {
      throw new Error("Assertion failed: dialogue_items.length != next_item_idx");
    }
    return self;
  }
}

/**
 * @param message_history The chat history to match against, in reverse order (most recent first)
 */
export async function matchDialogue(message_history: MatchDialogueChatHistoryEntry[], abort: AbortSignal, db?: DBClient): Promise<MatchDialogueResult> {
  if (!db) {
    return await withDBClient(db => matchDialogue(message_history, abort, db));
  }

  let matcher = await DialogueMatcher.fromDatabase(db);
  // TODO: cache matcher

  // TODO: Implement
  return {
    matched_phrasings: [],
    match_scores: [],
    best_match_dialogue: null,
    direct_result: false,
  }
}
