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
import MessageInputBox from "./messageInputBox";
import { generateToken } from "lib/secure_token/browser";
import { MaybeShowTyping } from "./typingAnimation";
import { SharedStateProvider } from "app/utils/sharedstate";

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
};

export class ChatController extends React.Component<P, S> {
  containerRef: RefObject<HTMLDivElement>;
  unsubscribeCredentials: () => void;

  sseEventSource: EventSource | null = null;
  ssePingTimeout: number | null = null;

  constructor(props: P) {
    super(props);
    this.state = InitialState;
    this.containerRef = React.createRef();

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
  }

  get chat_token(): string | null {
    return getCredentialManager().getChatTokenFor(this.props.chat_id);
  }

  get admin_token(): string | null {
    return getCredentialManager().admin_token;
  }

  updateMessage(message: Message) {
    const messages = this.state.messages;
    const insert_loc = messages.findIndex(m => m.id >= message.id);
    if (insert_loc == -1) {
      messages.push(message);
    } else if (messages[insert_loc].id == message.id) {
      messages[insert_loc] = message;
    } else {
      messages.splice(insert_loc, 0, message);
    }

    const inTransitMessages = this.state.inTransitMessages;
    let idx = inTransitMessages.findIndex(m => m.client_tag === message.client_tag);
    if (idx != -1) {
      inTransitMessages.splice(idx, 1);
    }

    this.setState({
      messages: messages,
      inTransitMessages: inTransitMessages,
      typingExpiry: null,
    });
  }

  stopSSE() {
    if (this.ssePingTimeout) {
      clearTimeout(this.ssePingTimeout);
      this.ssePingTimeout = null;
    }
    if (this.sseEventSource) {
      this.sseEventSource.close();
      this.sseEventSource = null;
    }
  }

  startSSE(): Promise<void> {
    this.stopSSE();
    let maybe_token = "";
    if (this.chat_token) {
      maybe_token = `chat_token=${encodeURIComponent(this.chat_token)}`;
    }
    let sseEventSource = new EventSource(
      `/api/v1/chat-session/${encodeURIComponent(this.props.chat_id)}/stream?${maybe_token}`
    );
    this.sseEventSource = sseEventSource;
    const ssePingTimeout = () => {
      if (this.sseEventSource !== sseEventSource) {
        return;
      }
      console.error("Did not receive SSE ping for 10 seconds, re-opening a new connection...");
      this.startSSE().catch(err => {
        console.error("Failed to re-open SSE connection:", err);
        this.setState({ messages_error: new Error("Connection to server lost, latest messages may not be displayed.") });
      });
    }
    const refreshSSEPingTimeout = () => {
      if (this.sseEventSource !== sseEventSource) {
        return;
      }
      if (this.ssePingTimeout) {
        clearTimeout(this.ssePingTimeout);
      }
      this.ssePingTimeout = setTimeout(ssePingTimeout, 10000);
    };
    sseEventSource.addEventListener("message", evt => {
      refreshSSEPingTimeout();
      let msg: Message = JSON.parse(evt.data);
      this.updateMessage(msg);
    });
    sseEventSource.addEventListener("deleteMessage", evt => {
      let id = evt.data;
      let idx = this.state.messages.findIndex(m => m.id == id);
      if (idx != -1) {
        this.state.messages.splice(idx, 1);
        this.setState({ messages: this.state.messages });
      }
    });
    sseEventSource.addEventListener("suggestions", evt => {
      let suggestions: ChatSuggestions = JSON.parse(evt.data);
      this.setState({ suggestions: suggestions });
    });
    sseEventSource.addEventListener("ping", evt => {
      refreshSSEPingTimeout();
    });
    return new Promise((resolve, reject) => {
      let resolved = false;
      sseEventSource.addEventListener("open", evt => {
        resolve();
        resolved = true;
        refreshSSEPingTimeout();
      });
      sseEventSource.addEventListener("error", evt => {
        if (resolved) {
          console.error("SEE connection closed unexpectedly.");
          this.startSSE().catch(e => {
            console.error("Unable to restart SSE connection.", e);
            this.setState({
              messages_error: new Error("Connection to server lost, latest messages may not be displayed.")
            });
          });
          return;
        }
        reject(new Error("Unable to start server-sent events connection."));
        this.stopSSE();
      });
    });
  }

  async initialize() {
    try {
      if (!this.chat_token && !this.admin_token) {
        this.setState({
          no_permission: true,
          initial_loading: false,
        });
        return;
      }
      let arr = await Promise.allSettled([
        fetchChatData(this.props.chat_id).then(init_msg_list => {
          this.setState({
            messages: init_msg_list.messages,
            suggestions: init_msg_list.last_suggestions,
            initial_loading: false,
            messages_error: null,
          });
        }),
        this.startSSE(),
      ]);
      for (let elem of arr) {
        if (elem.status == "rejected") {
          throw elem.reason;
        }
      }
    } catch (e) {
      this.setState({
        messages_error: e,
        initial_loading: false,
      });
      this.stopSSE();
    }
  }

  unload() {
    this.stopSSE();
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

  render(): React.ReactNode {
    return (
      <SharedStateProvider sessionStorageId={`chat_${this.props.chat_id}`}>
        <div className={classes.container}>
          <div ref={this.containerRef} className={
            classes.messageListContainer +
            ((this.state.messages.length == 0 && this.state.messages_error ||
              this.state.no_permission)
              ? ` ${classes.messageListContainerCenter}` : ` ${classes.messageListContainerJustifyBottom}`)
          }>
            {this.state.messages.length > 0 ? (
              <AutoScrollComponent containerRef={this.containerRef} onUserScroll={this.setUserScrollState}>
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
          <MessageInputBox
            chat_id={this.props.chat_id}
            suggestions={this.curr_input_suggestions}
            show_shadow={!this.state.scrolling_to_bottom}
            onSend={this.handleSendMessage}
          />
        </div>
      </SharedStateProvider >
    );
  }

  async handleSendMessage(msg: string) {
    let phantom: PhantomMessage = {
      client_tag: (await generateToken()).token_str,
      content: msg,
      msg_type: MessageType.USER,
      error: null,
    };
    this.state.inTransitMessages.push(phantom);
    this.setState({
      inTransitMessages: this.state.inTransitMessages,
      suggestions: null,
    });
    await this.handleSendPhantom(phantom);
  }

  async handleSendPhantom(phantom: PhantomMessage) {
    try {
      await DefaultService.postChatSessionSendChat(this.props.chat_id, this.chat_token, {
        message: phantom.content,
        client_tag: phantom.client_tag,
      });
      // Phantom will be automatically removed by SSE event.
      this.setState({
        typingExpiry: Date.now() + 8000,
      });
    } catch (e) {
      phantom.error = e;
      this.setState({
        inTransitMessages: this.state.inTransitMessages,
        typingExpiry: null,
      });
    }
  }
}
