/**
 * A manager class for idempotent tags.
 */

interface ClientTagEntry {
  response: any;

  // milliseconds since epoch
  time: number;
}

const TAG_TTL = 1000 * 60 * 30;

class ClientTagManager {
  private stored_tags: Map<string, ClientTagEntry> = new Map();
  private sorted_tag_names: string[] = [];
  constructor() {
    setInterval(() => this.cleanup(), 1000 * 10);
  }

  async check_tag(tag: string | undefined): Promise<ClientTagEntry | null> {
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
      return null;
    }
    return tag_entry;
  }

  async set_tag(tag: string | undefined, response: any) {
    if (!tag) {
      return;
    }
    this.stored_tags.set(tag, {
      response,
      time: Date.now(),
    });
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
