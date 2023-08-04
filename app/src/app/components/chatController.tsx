import React, { RefObject } from "react";
import { getCredentialManager, subscribe as credentialsSubscribe } from "app/utils/credentials";
import { DefaultService as API, ChatSession, Message } from "app/openapi"
import ChatSkeleton from "app/components/chatSkeleton";
import StartNewChatButton from "./startNewChatButton";
import * as classes from "./chatController.module.css"
import { Button } from "@fluentui/react-components";
import { Alert } from "@fluentui/react-components/unstable";
import ChatMessagesList from "./chatMessagesList";
import AutoScrollComponent from "./autoScroll";
import MessageInputBox from "./messageInputBox";

async function fetchChatData(chat_id: string): Promise<ChatSession> {
  const chat_token = getCredentialManager().getChatTokenFor(chat_id);
  let sess_data = await API.getChatSession(chat_id, undefined, undefined, chat_token);
  return sess_data;
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
};

export class ChatController extends React.Component<P, S> {
  containerRef: RefObject<HTMLDivElement>;
  unsubscribeCredentials: () => void;

  constructor(props: P) {
    super(props);
    this.state = InitialState;
    this.containerRef = React.createRef();

    this.retryInitialLoad = this.retryInitialLoad.bind(this);
    this.forceUpdate = this.forceUpdate.bind(this);

    this.unsubscribeCredentials = credentialsSubscribe(this.forceUpdate);
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

  async initialize() {
    try {
      if (!this.chat_token && !this.admin_token) {
        this.setState({
          no_permission: true,
          initial_loading: false,
        });
        return;
      }
      let init_msg_list = await fetchChatData(this.props.chat_id);
      this.setState({
        messages: init_msg_list.messages,
        initial_loading: false,
        messages_error: null,
      });
    } catch (e) {
      this.setState({
        messages_error: e,
        initial_loading: false,
      });
    }
  }

  unload() {
    this.setState(InitialState);
  }

  retryInitialLoad() {
    this.unload();
    this.initialize();
  }

  render(): React.ReactNode {
    return (
      <div className={classes.container}>
        <div ref={this.containerRef} className={
          classes.messageListContainer +
          ((this.state.messages.length == 0 && this.state.messages_error ||
            this.state.no_permission)
            ? ` ${classes.messageListContainerCenter}` : ` ${classes.messageListContainerJustifyBottom}`)
        }>
          {this.state.messages_error ? (
            <ChatListError err={this.state.messages_error} onRetry={this.retryInitialLoad} />
          ) : null}
          {this.state.no_permission ? (
            <div className={classes.noPermission}>
              You do not have access to this chat.<br /><br />
              <StartNewChatButton />
            </div>
          ) : null}
          {this.state.messages.length > 0 ? (
            <AutoScrollComponent containerRef={this.containerRef}>
              <ChatMessagesList messages_list={this.state.messages} enable_buttons={true} />
            </AutoScrollComponent>
          ) : (
            this.state.initial_loading ? (
              <>
                <ChatSkeleton />
                <ChatSkeleton skipFirstBotMsg={true} />
              </>
            ) : null
          )}
        </div>
        <MessageInputBox chat_id={this.props.chat_id} />
      </div>
    );
  }
}
