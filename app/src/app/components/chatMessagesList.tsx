import React from "react";
import { ApiError, DefaultService, Message, MessageType } from "app/openapi";
import classes from "./chatMessagesList.module.css"
import { Button, Skeleton, SkeletonItem, Spinner, Text, Tooltip } from "@fluentui/react-components";
import { ArrowUndo16Regular, Edit16Filled, Edit16Regular, ErrorCircle20Regular } from "@fluentui/react-icons";
import { useAutoScrollUpdateSignal } from "./autoScroll";
import { useSharedState } from "app/utils/sharedstate";
import { getCredentialManager, useChatCredentials } from "app/utils/credentials";
import { useChatController } from "./contexts";
import { useToastController, Toast, ToastTitle, ToastBody } from "@fluentui/react-toast";

const MessageEditComponent = React.lazy(() => import("./messageEdit"));

interface MessageComponentProps {
  message: Message;
  enable_buttons: boolean;
  handle_edit?: () => void;
  editing?: boolean;
};

export interface PhantomMessage {
  client_tag: string;
  msg_type: MessageType;
  content: string;
  error: Error | null;
}

export interface Props {
  messages_list: Message[];
  enable_buttons: boolean;
}

function getBox(content: string, type: MessageType, strikethrough: boolean) {
  return (
    <div className={classes.box}>
      <Text
        weight={type == MessageType.USER ? "semibold" : "regular"}
        size={400}
        strikethrough={strikethrough}
        style={{ whiteSpace: "pre-wrap" }}
      >
        {content}
      </Text>
    </div>
  );
}

export function OrderBoxAndButtons({ message_type, box, buttons }) {
  return (
    <>
      {message_type == MessageType.USER ? (
        <>
          {buttons}
          {box}
        </>
      ) : null}
      {message_type == MessageType.BOT ? (
        <>
          {box}
          {buttons}
        </>
      ) : null}
    </>
  )
}

export function MessageComponent({ message, enable_buttons, handle_edit, editing }: MessageComponentProps) {
  const box = getBox(message.content, message.msg_type, message.exclude_from_generation);
  const chatController = useChatController();
  const chatToken = useChatCredentials(chatController.session_id);
  const toastController = useToastController();
  const [rollingBack, setRollingBack] = React.useState(false);
  async function handleRollback() {
    try {
      setRollingBack(true);
      await DefaultService.postMessagesRollbackChat(message.id, chatToken);
      setRollingBack(false);
      chatController.handlePostRollbackChat(message.id);
    } catch (e) {
      setRollingBack(false);
      if (e instanceof ApiError) {
        e = new Error(e.body);
      }
      toastController.dispatchToast(
        <Toast>
          <ToastTitle>Failed to roll back message</ToastTitle>
          <ToastBody>{e.toString()}</ToastBody>
        </Toast>,
        { intent: "error" }
      );
    }
  }
  const buttons = (
    <div className={classes.buttons}>
      {(enable_buttons && handle_edit && message.msg_type == MessageType.BOT && message.metadata) ?
        <Button
          onClick={handle_edit}
          icon={message.metadata?.updated_before ? <Edit16Filled /> : <Edit16Regular />}
          appearance="transparent"
          title="Improve this message"
          size="small"
        />
        : null}
      {(enable_buttons && message.msg_type == MessageType.USER && !message.exclude_from_generation && chatToken) ? (
        <Button
          onClick={handleRollback}
          icon={<ArrowUndo16Regular />}
          appearance="transparent"
          title="Rollback this and below message"
          size="small"
          disabled={rollingBack}
        />
      ) : null}
    </div>
  )
  return (
    <div className={
      classes.message + " " + classes[`msgType_${message.msg_type}`] +
      (message.exclude_from_generation ? ` ${classes.excludedMsg}` : "") +
      (editing ? ` ${classes.editingMsg}` : "")
    }>
      <OrderBoxAndButtons message_type={message.msg_type} box={box} buttons={buttons} />
    </div>
  )
}

export function PhantomMessageComponent({ message, onRetry }: { message: PhantomMessage, onRetry: (msg: PhantomMessage) => void }) {
  const box = getBox(message.content, message.msg_type, false);
  const buttons = (
    <div className={classes.buttons + " " + classes.phantomButtons}>
      {message.error ? (
        <Tooltip content={<>Failed to send: {message.error.message}<br />click to retry</>} relationship="label">
          <Button size="small" appearance="transparent" icon={<ErrorCircle20Regular color="#d13438" />} onClick={() => onRetry(message)} />
        </Tooltip>
      ) : (
        <Spinner size="extra-tiny" />
      )}
    </div>
  );
  return (
    <div className={classes.message + " " + classes[`msgType_${message.msg_type}`]}>
      <OrderBoxAndButtons message_type={message.msg_type} box={box} buttons={buttons} />
    </div>
  );
}

export default function ChatMessagesList({ messages_list, enable_buttons }: Props) {
  const [editingMsg, setEditingMsg] = useSharedState<string | null>(`ChatMessageList.editing`, null);
  const autoScrollUpdate = useAutoScrollUpdateSignal();
  const canEdit = getCredentialManager().has_admin_auth;
  const msg_edit_suspense = (
    <Skeleton>
      <SkeletonItem />
      <div style={{ height: "10px" }} />
      <SkeletonItem />
      <div style={{ height: "10px" }} />
      <SkeletonItem />
    </Skeleton>
  );
  return (
    <>
      {messages_list.map((message, i) => {
        const handleEdit = () => {
          setEditingMsg(message.id);
          autoScrollUpdate();
        };
        const handleClose = () => {
          setEditingMsg(null);
          autoScrollUpdate();
        };
        let lastUserMessage = null;
        const editingCurrMsg = editingMsg === message.id;
        if (editingCurrMsg && i > 0) {
          for (let j = i - 1; j >= 0; j--) {
            if (messages_list[j].msg_type == MessageType.USER) {
              lastUserMessage = messages_list[j];
              break;
            }
          }
        }
        return (
          <React.Fragment key={message.id}>
            <MessageComponent
              message={message}
              handle_edit={(enable_buttons && canEdit) ? handleEdit : undefined}
              editing={editingCurrMsg}
              enable_buttons={enable_buttons}
            />
            {editingCurrMsg ? (
              <React.Suspense fallback={msg_edit_suspense}>
                <MessageEditComponent message={message} userMessage={lastUserMessage} onClose={handleClose} />
              </React.Suspense>
            ) : null}
          </React.Fragment>
        );
      })}
    </>
  );
}
