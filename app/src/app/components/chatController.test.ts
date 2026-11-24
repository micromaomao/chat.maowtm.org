import { describe, expect, it, jest } from "@jest/globals";
import { ChatController } from "./chatController";
import { MessageType } from "app/openapi";

jest.mock("app/utils/credentials", () => ({
  subscribe: () => () => undefined,
  getCredentialManager: () => ({ admin_token: null, getChatTokenFor: () => null }),
}));

function batchedController() {
  const controller = new ChatController({ chat_id: "session" });
  type State = typeof controller.state;
  type Update = Partial<State> | null | ((state: Readonly<State>, props: typeof controller.props) => Partial<State> | null);
  const pending: Update[] = [];
  controller.setState = (update: Update) => { pending.push(update); };
  return {
    controller,
    flush() {
      for (const update of pending.splice(0)) {
        const changes = typeof update === "function" ? update(controller.state, controller.props) : update;
        if (changes) controller.state = { ...controller.state, ...changes };
      }
    },
  };
}

describe("batched WebSocket updates", () => {
  it("keeps every message when replay delivers several frames before React flushes", () => {
    const { controller, flush } = batchedController();
    controller.updateMessage({ id: "1", msg_type: MessageType.USER, content: "first", exclude_from_generation: false });
    controller.updateMessage({ id: "2", msg_type: MessageType.BOT, content: "second", exclude_from_generation: false });
    flush();
    expect(controller.state.messages.map(message => message.id)).toEqual(["1", "2"]);
  });

  it("does not resurrect an acknowledged phantom while another message is being sent", () => {
    const { controller, flush } = batchedController();
    controller.updatePhantom("a", { client_tag: "a", content: "first", msg_type: MessageType.USER, error: null });
    flush();
    controller.updateMessage({ id: "1", msg_type: MessageType.USER, content: "first", client_tag: "a", exclude_from_generation: false });
    controller.updatePhantom("b", { client_tag: "b", content: "second", msg_type: MessageType.USER, error: null });
    flush();
    expect(controller.state.inTransitMessages.map(message => message.client_tag)).toEqual(["b"]);
  });

  it("clears a queued typing indicator when the reply arrives in the same batch", () => {
    const { controller, flush } = batchedController();
    controller.showTyping("1");
    controller.updateMessage({ id: "2", msg_type: MessageType.BOT, content: "reply", exclude_from_generation: false });
    flush();
    expect(controller.state.typingFor).toBeNull();
  });
});
