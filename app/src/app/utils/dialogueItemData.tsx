import { AdminService, ApiError, DialogueItemDetails, ListDialogueItemsResult } from "app/openapi";
import { useEffect, useState } from "react";

const pendingPromise: Map<string, Promise<DialogueItemDetails>> = new Map();
const cache: Map<string, DialogueItemDetails> = new Map();

let rootItemsPromise: Promise<ListDialogueItemsResult> | null = null;

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

export function mutateDialogues() {
  cache.clear();
  rootItemsPromise = null;
}

export function fetchRootItems() {
  if (rootItemsPromise) {
    return rootItemsPromise;
  } else {
    rootItemsPromise = AdminService.getListDialogueItems().then(res => res, err => {
      if (err instanceof ApiError) {
        err = new Error(err.body);
      }
      rootItemsPromise = null;
      throw err;
    });
    return rootItemsPromise;
  }
}
