import { DialogueItemInput, DialoguePath, FetchedDialogueItemData } from "../api/v1/types";

export async function traceDialogueItemPath(): Promise<DialoguePath> {
  throw new Error("Not implemented");
}

export async function getDialogueItem(): Promise<FetchedDialogueItemData> {
  throw new Error("Not implemented");
}

export function updateDialogueItem(item_id: string, data: DialogueItemInput): Promise<void> {
  throw new Error("Not implemented");
}
