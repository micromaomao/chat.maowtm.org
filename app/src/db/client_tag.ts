/**
 * A manager class for idempotent tags.
 */

interface ClientTagEntry {
  response: any;

  // milliseconds since epoch
  time: number;

  // Random data affixed to the tag.
  ulid?: string;
}

const TAG_TTL = 1000 * 60 * 30;

class ClientTagManager {
  private stored_tags: Map<string, ClientTagEntry> = new Map();
  private sorted_tag_names: string[] = [];
  private ulid_to_tag: Map<string, string> = new Map();

  constructor() {
    setInterval(() => this.cleanup(), 1000 * 10);
  }

  async checkTag(tag: string | undefined): Promise<ClientTagEntry | null> {
    if (!tag) {
      return null;
    }
    const tag_entry = this.stored_tags.get(tag);
    if (tag_entry == undefined) {
      return null;
    }
    const now = Date.now();
    if (tag_entry.time + TAG_TTL < now) {
      this.stored_tags.delete(tag);
      if (tag_entry.ulid) {
        this.ulid_to_tag.delete(tag_entry.ulid);
      }
      return null;
    }
    return tag_entry;
  }

  async setTag(tag: string | undefined, response: any, ulid?: string) {
    if (!tag) {
      return;
    }
    this.stored_tags.set(tag, {
      response,
      time: Date.now(),
      ulid
    });
    if (ulid) {
      this.ulid_to_tag.set(ulid, tag);
    }
  }

  async ulidToTag(ulid: string): Promise<string | undefined> {
    const tag = this.ulid_to_tag.get(ulid);
    if (tag === undefined) {
      return undefined;
    }
    const tag_entry = this.stored_tags.get(tag);
    if (tag_entry === undefined) {
      this.ulid_to_tag.delete(ulid);
      return undefined;
    }
    if (tag_entry.time + TAG_TTL < Date.now()) {
      this.ulid_to_tag.delete(ulid);
      this.stored_tags.delete(tag);
      return undefined;
    }
    return tag;
  }

  async cleanup() {
    let nb_to_delete = 0;
    const now = Date.now();
    for (const tag_name of this.sorted_tag_names) {
      const tag_entry = this.stored_tags.get(tag_name);
      if (tag_entry == undefined) {
        nb_to_delete += 1;
      } else if (tag_entry.time + TAG_TTL < now) {
        this.stored_tags.delete(tag_name);
        if (tag_entry.ulid) {
          this.ulid_to_tag.delete(tag_entry.ulid);
        }
        nb_to_delete += 1;
      } else {
        break;
      }
    }
    this.sorted_tag_names.splice(0, nb_to_delete);
  }
}

const instance = new ClientTagManager();
export default instance;
