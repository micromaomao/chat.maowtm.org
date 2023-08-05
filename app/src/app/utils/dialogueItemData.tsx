import { AdminService, ApiError, DialogueItemDetails } from "app/openapi";
import { useEffect, useState } from "react";

const pendingPromise: Map<string, Promise<DialogueItemDetails>> = new Map();
const cache: Map<string, DialogueItemDetails> = new Map();

export function fetchDialogueItem(id: string): Promise<DialogueItemDetails> {
  if (cache.has(id)) {
    return Promise.resolve(cache.get(id));
  }
  if (pendingPromise.has(id)) {
    return pendingPromise.get(id);
  }
  const promise = AdminService.getDialogueItem(id).then(res => {
    cache.set(id, res);
    pendingPromise.delete(id);
    return res;
  }, err => {
    if (err instanceof ApiError) {
      err = new Error(err.body);
    }
    pendingPromise.delete(id);
    throw err;
  });
  pendingPromise.set(id, promise);
  return promise;
}

export function useDialogueItemData(id: string | null): [Error, DialogueItemDetails] {
  const [data, setData] = useState<DialogueItemDetails>(null);
  const [error, setError] = useState(null);


  return [error, data];
}

export function mutateDialogueGroup(group_id: string) {
  let keys = Array.from(cache.keys());
  for (let key of keys) {
    let ent = cache.get(key);
    if (ent && ent.group_id == group_id) {
      cache.delete(key);
    }
  }
}
