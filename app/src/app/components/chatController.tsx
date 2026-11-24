import React, { RefObject } from "react";
import { getCredentialManager, subscribe as credentialsSubscribe } from "app/utils/credentials";
import { DefaultService as API, ApiError, ChatSession, ChatSuggestions, DefaultService, Message, MessageType } from "app/openapi"
import ChatSkeleton from "app/components/chatSkeleton";
import StartNewChatButton from "./startNewChatButton";
import * as classes from "./chatController.module.css"
import { Button } from "@fluentui/react-components";
import { Alert } from "@fluentui/react-components/unstable";
import ChatMessagesList, { PhantomMessage, PhantomMessageComponent } from "./chatMessagesList";
import AutoScrollComponent from "./autoScroll";
import * as MessageInputBox from "./messageInputBox";
import { generateToken } from "lib/secure_token/browser";
import { MaybeShowTyping } from "./typingAnimation";
import { SharedStateProvider } from "app/utils/sharedstate";
import { ChatSocket } from "app/utils/chatSocket";
import { chatControllerContext } from "./contexts";
import { clearReplyAnalysisCache } from "app/utils/replyAnalysis";
import ChatInitialBanner from "./chatInitialBanner";

async function fetchChatData(chat_id: string): Promise<ChatSession> {
  const chat_token = getCredentialManager().getChatTokenFor(chat_id);
  try {
    let sess_data = await API.getChatSession(chat_id, undefined, undefined, chat_token);
    return sess_data;
  } catch (e) {
    if (e instanceof ApiError) {
      e = new Error(e.body);
    }
    throw e;
  }
}

function ChatListError({ err, onRetry }: { err: Error, onRetry: () => void }) {
  return (
    <div className={classes.error}>
      <Alert
        intent="error"
        action={<Button onClick={() => onRetry()}>Retry</Button>}
      >
        Failed to load chat messages: {err.message}
      </Alert>
    </div>
  );
}

interface S {
  messages: Message[];
  initial_loading: boolean;
  messages_error: Error | null;
  no_permission: boolean;
  scrolling_to_bottom: boolean;
  suggestions: ChatSuggestions | null;
  inTransitMessages: PhantomMessage[];
  typingExpiry: number | null;
  typingFor: string | null;
}

interface P {
  chat_id: string;
}

const InitialState: S = {
  messages: [],
  initial_loading: true,
  messages_error: null,
  no_permission: false,
  scrolling_to_bottom: true,
  suggestions: null,
  inTransitMessages: [],
  typingExpiry: null,
  typingFor: null,
};

export class ChatController extends React.Component<P, S> {
  containerRef: RefObject<HTMLDivElement>;
  unsubscribeCredentials: () => void;

  chatSocket: ChatSocket | null = null;
  private lifecycle = 0;

  inputBoxRef: RefObject<MessageInputBox.R>;

  constructor(props: P) {
    super(props);
    this.state = InitialState;
    this.containerRef = React.createRef();
    this.inputBoxRef = React.createRef();

    this.retryInitialLoad = this.retryInitialLoad.bind(this);
    this.forceUpdate = this.forceUpdate.bind(this);

    this.unsubscribeCredentials = credentialsSubscribe(this.forceUpdate);
    this.setUserScrollState = this.setUserScrollState.bind(this);
    this.handleSendMessage = this.handleSendMessage.bind(this);
    this.handleSendPhantom = this.handleSendPhantom.bind(this);
  }

  componentDidMount() {
    this.initialize();
  }

  componentDidUpdate(prevProps: Readonly<P>, prevState: Readonly<S>, snapshot?: any) {
    if (this.props.chat_id !== prevProps.chat_id) {
      this.unload();
      this.initialize();
    }
  }

  componentWillUnmount(): void {
    this.unsubscribeCredentials();
    this.unload();
  }

  get chat_token(): string | null {
    return getCredentialManager().getChatTokenFor(this.props.chat_id);
  }

  get admin_token(): string | null {
    return getCredentialManager().admin_token;
  }

  get session_id(): string {
    return this.props.chat_id;
  }

  clearTypingOnMsg(msg_id: string) {
    this.setState(state => state.typingFor !== null && state.typingFor <= msg_id ? {
        typingFor: null,
        typingExpiry: null,
      } : null);
  }

  showTyping(msg_id: string) {
    this.setState(state => {
      if (state.messages.some(message => message.id > msg_id &&
        [MessageType.BOT, MessageType.ERROR].includes(message.msg_type))) return null;
      if (state.typingFor !== null && state.typingFor >= msg_id) return null;
      return {
        typingFor: msg_id,
        typingExpiry: Date.now() + 60000,
      };
    });
  }

  updateMessage(message: Message) {
    this.setState(state => {
      const messages = state.messages.slice();
      const insert_loc = messages.findIndex(m => m.id >= message.id);
      if (insert_loc == -1) {
        messages.push(message);
      } else if (messages[insert_loc].id == message.id) {
        messages[insert_loc] = message;
      } else {
        messages.splice(insert_loc, 0, message);
      }
      return {
        messages,
        inTransitMessages: state.inTransitMessages.filter(phantom => phantom.client_tag !== message.client_tag),
      };
    });

    if (message.msg_type == MessageType.BOT || message.msg_type == MessageType.ERROR) {
      this.clearTypingOnMsg(message.id);
    }
  }

  updatePhantom(client_tag: string, phantom: PhantomMessage | null) {
    this.setState(state => {
      const inTransitMessages = state.inTransitMessages.filter(x => x.client_tag != client_tag);
      if (phantom && !state.messages.some(message => message.client_tag === client_tag)) {
        inTransitMessages.push(phantom);
      }
      return { inTransitMessages };
    });
  }

  stopWebSocket() {
    this.chatSocket?.stop();
    this.chatSocket = null;
  }

  startWebSocket(): Promise<void> {
    this.stopWebSocket();
    const socket = new ChatSocket(
      this.session_id,
      () => ({ chatToken: this.chat_token, adminToken: this.admin_token }),
      event => {
        if (this.chatSocket !== socket) return;
        switch (event.event) {
          case "snapshot": {
            const snapshot: ChatSession = event.data;
            this.setState(state => ({
              messages: snapshot.messages,
              suggestions: snapshot.last_suggestions || null,
              initial_loading: false,
              inTransitMessages: state.inTransitMessages.filter(phantom =>
                !snapshot.messages.some(message => message.client_tag === phantom.client_tag)),
            }));
            const last = snapshot.messages[snapshot.messages.length - 1];
            if (last?.msg_type === MessageType.USER && !last.exclude_from_generation) this.showTyping(last.id);
            else if (last) this.clearTypingOnMsg(last.id);
            break;
          }
          case "message":
            this.updateMessage(event.data);
            break;
          case "suggestions":
            this.setState({ suggestions: event.data });
            break;
          case "cursor":
            break;
          default:
            console.error("Unknown chat event", event.event);
        }
      },
      error => {
        if (this.chatSocket === socket) this.setState({ messages_error: error });
      },
    );
    this.chatSocket = socket;
    return socket.start();
  }

  async initialize() {
    const lifecycle = ++this.lifecycle;
    clearReplyAnalysisCache();
    try {
      if (!this.chat_token && !this.admin_token) {
        this.setState({
          no_permission: true,
          initial_loading: false,
        });
        return;
      }
      let sess_id = this.session_id;
      await this.startWebSocket();
      if (this.session_id != sess_id) return;
    } catch (e) {
      if (this.lifecycle !== lifecycle) return;
      this.setState({
        messages_error: e,
        initial_loading: false,
      });
      this.stopWebSocket();
    }
  }

  async reloadMessages() {
    let data = await fetchChatData(this.props.chat_id);
    for (let msg of data.messages) {
      this.updateMessage(msg);
    }
    this.setState({
      suggestions: data.last_suggestions,
    });
  }

  unload() {
    this.lifecycle++;
    this.stopWebSocket();
    this.setState(InitialState);
  }

  retryInitialLoad() {
    this.unload();
    this.initialize();
  }

  setUserScrollState(at_bottom: boolean) {
    this.setState({ scrolling_to_bottom: at_bottom });
  }

  get curr_input_suggestions(): string[] {
    if (!this.state.suggestions || this.state.messages.length == 0) {
      return [];
    }
    if (this.state.messages[this.state.messages.length - 1].id != this.state.suggestions.reply_msg) {
      return [];
    }
    return this.state.suggestions.suggestions;
  }

  async handleSendMessage(msg: string) {
    let phantom: PhantomMessage = {
      client_tag: (await generateToken()).token_str,
      content: msg,
      msg_type: MessageType.USER,
      error: null,
    };
    this.setState({
      suggestions: null,
    });
    this.updatePhantom(phantom.client_tag, phantom);
    await this.handleSendPhantom(phantom);
  }

  async handleSendPhantom(phantom: PhantomMessage) {
    phantom = { ...phantom, error: null };
    this.updatePhantom(phantom.client_tag, phantom);
    let sess = this.session_id;
    try {
      let msg_id = await DefaultService.postChatSessionSendChat(this.props.chat_id, this.chat_token, {
        message: phantom.content,
        client_tag: phantom.client_tag,
      });
      if (this.session_id != sess) return;
      // The server echoes the client tag through the WebSocket.
      this.showTyping(msg_id);
    } catch (e) {
      if (this.session_id != sess) return;
      if (e instanceof ApiError) {
        e = new Error(e.body);
      }
      this.updatePhantom(phantom.client_tag, { ...phantom, error: e });
    }
  }

  handleMarkMessageEdited(message_id: string) {
    let messages = this.state.messages.slice();
    let idx = messages.findIndex(m => m.id == message_id);
    if (idx != -1) {
      messages[idx] = { ...messages[idx] };
      if (messages[idx].metadata) {
        messages[idx].metadata.updated_before = true;
      }
      this.setState({ messages: messages });
    }
  }

  handlePostRollbackChat(message_id: string) {
    let messages = this.state.messages.slice();
    let idx = messages.findIndex(m => m.id >= message_id);
    let userText: string | null = null;
    if (idx != -1) {
      for (let i = idx; i < messages.length; i++) {
        if (messages[i].id < message_id) continue;
        if (![MessageType.USER, MessageType.BOT].includes(messages[i].msg_type)) {
          continue;
        }
        messages[i] = { ...messages[i], exclude_from_generation: true };
        if (!userText && messages[i].msg_type == MessageType.USER) {
          userText = messages[i].content;
        }
      }
      this.setState({ messages: messages });
    }
    if (userText) {
      this.populateInputBoxIfEmpty(userText);
    }
  }

  populateInputBoxIfEmpty(content: string) {
    if (this.inputBoxRef.current) {
      let box = this.inputBoxRef.current;
      if (box.text.trim().length == 0) {
        box.setText(content);
        box.focus();
      }
    }
  }

  simulateInputBoxSuggestion(suggestion: string) {
    if (this.inputBoxRef.current) {
      this.inputBoxRef.current.selectSuggestion(suggestion);
    }
  }

  shouldShowInitialBanner(): boolean {
    // return this.state.messages.every(m => m.msg_type == MessageType.BOT);
    return true;
  }

  render(): React.ReactNode {
    return (
      <chatControllerContext.Provider value={this}>
        <SharedStateProvider sessionStorageId={`chat_${this.props.chat_id}`} key={this.props.chat_id}>
          <div className={classes.container}>
            <div ref={this.containerRef} className={
              classes.messageListContainer +
              ((this.state.messages.length == 0 && this.state.messages_error ||
                this.state.no_permission)
                ? ` ${classes.messageListContainerCenter}` : ` ${classes.messageListContainerJustifyBottom}`)
            }>
              {this.state.messages.length > 0 ? (
                <AutoScrollComponent containerRef={this.containerRef} onUserScroll={this.setUserScrollState}>
                  {this.shouldShowInitialBanner() ? (
                    <ChatInitialBanner />
                  ) : null}
                  <ChatMessagesList messages_list={this.state.messages} enable_buttons={true} />
                  {this.state.inTransitMessages.map(msg => (
                    <PhantomMessageComponent key={msg.client_tag} message={msg} onRetry={this.handleSendPhantom} />
                  ))}
                  <MaybeShowTyping expiryTime={this.state.typingExpiry} />
                </AutoScrollComponent>
              ) : (
                this.state.initial_loading ? (
                  <>
                    <ChatSkeleton />
                    <ChatSkeleton skipFirstBotMsg={true} />
                  </>
                ) : null
              )}
              {this.state.messages_error ? (
                <ChatListError err={this.state.messages_error} onRetry={this.retryInitialLoad} />
              ) : null}
              {this.state.no_permission ? (
                <div className={classes.noPermission}>
                  You do not have access to this chat.<br /><br />
                  <StartNewChatButton />
                </div>
              ) : null}
            </div>
            <MessageInputBox.Component
              ref={this.inputBoxRef}
              chat_id={this.props.chat_id}
              suggestions={this.curr_input_suggestions}
              show_shadow={!this.state.scrolling_to_bottom}
              onSend={this.handleSendMessage}
            />
          </div>
        </SharedStateProvider >
      </chatControllerContext.Provider>
    );
  }

}
