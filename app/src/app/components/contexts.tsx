import { createContext, useContext } from "react";
import type { ChatController } from "./chatController";

export const chatControllerContext = createContext<ChatController | null>(null);

export function useChatController(): ChatController {
  return useContext(chatControllerContext)!;
}
