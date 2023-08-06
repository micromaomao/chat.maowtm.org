import { DefaultService } from "app/openapi";
import { getCredentialManager } from "./credentials";
import { NavigateFunction } from "react-router-dom";
import { ApiError } from "app/openapi";

export async function startNewChat(navigate: NavigateFunction) {
  try {
    let { chat_token, session_id } = await DefaultService.postChatSession({});
    getCredentialManager().storeChatToken(session_id, chat_token);
    navigate(`/chat/${encodeURIComponent(session_id)}`);
  } catch (e) {
    if (e instanceof ApiError) {
      throw new Error(e.body);
    }
    throw e;
  }
}
