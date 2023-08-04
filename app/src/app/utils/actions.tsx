import { DefaultService } from "app/openapi";
import { getCredentialManager } from "./credentials";
import { NavigateFunction } from "react-router-dom";

export async function startNewChat(navigate: NavigateFunction) {
  let { chat_token, session_id } = await DefaultService.postChatSession({});
  getCredentialManager().storeChatToken(session_id, chat_token);
  navigate(`/chat/${encodeURIComponent(session_id)}`);
}
