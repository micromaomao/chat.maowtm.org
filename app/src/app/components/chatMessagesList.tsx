import React from "react";
import { ApiError, DefaultService, Message, MessageType } from "app/openapi";
import * as classes from "./chatMessagesList.module.css"
import { Button, Link, Skeleton, SkeletonItem, Spinner, Text, Tooltip } from "@fluentui/react-components";
import { ArrowUndo16Regular, Edit16Filled, Edit16Regular, ErrorCircle20Regular, ScanText16Regular } from "@fluentui/react-icons";
import { useAutoScrollUpdateSignal } from "./autoScroll";
import { useSharedState } from "app/utils/sharedstate";
import { getCredentialManager, useChatCredentials } from "app/utils/credentials";
import { useChatController } from "./contexts";
import { useToastController, Toast, ToastTitle, ToastBody } from "@fluentui/react-toast";

const MessageEditComponent = React.lazy(() => import("./messageEdit"));
const MessageInspectComponent = React.lazy(() => import("./messageInspect"));

interface MessageComponentProps {
  message: Message;
  enableButtons: boolean;
  handleEdit?: () => void;
  editing?: boolean;
  handleInspect?: () => void;
  inspecting?: boolean;
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
      {message_type == MessageType.ERROR ? (
        box
      ) : null}
    </>
  )
}

export function MessageButton({ show, onClick, icon, title, disabled }) {
  if (!show) {
    return null;
  }
  return (
    <a
      onClick={disabled ? undefined : onClick}
      title={title}
      className={classes.button + (disabled ? ` ${classes.btnDisabled}` : "")}
    >
      {icon}
    </a>
  )
}

export function MessageComponent({ message, enableButtons, handleEdit, editing, handleInspect, inspecting }: MessageComponentProps) {
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
      <MessageButton
        show={enableButtons && handleEdit && message.msg_type == MessageType.BOT && message.metadata}
        onClick={handleEdit}
        icon={message.metadata?.updated_before ? <Edit16Filled /> : <Edit16Regular />}
        title="Improve this message"
        disabled={false}
      />
      <MessageButton
        show={enableButtons && handleInspect && message.msg_type == MessageType.BOT && message.metadata}
        onClick={handleInspect}
        icon={<ScanText16Regular />}
        title="Show reply analysis"
        disabled={false}
      />
      <MessageButton
        show={enableButtons && message.msg_type == MessageType.USER && !message.exclude_from_generation && chatToken}
        onClick={handleRollback}
        icon={<ArrowUndo16Regular />}
        title="Rollback this and below message"
        disabled={rollingBack}
      />
    </div>
  )
  return (
    <div className={
      classes.message + " " + classes[`msgType_${message.msg_type}`] +
      (message.exclude_from_generation ? ` ${classes.excludedMsg}` : "") +
      ((editing || inspecting) ? ` ${classes.editingMsg}` : "")
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

export const EditingMsgStateKey = "ChatMessageList.editing";
export const InspectingMsgStateKey = "ChatMessageList.inspecting";

export default function ChatMessagesList({ messages_list, enable_buttons }: Props) {
  const [editingMsg, setEditingMsg] = useSharedState<string | null>(EditingMsgStateKey, null);
  const [inspectingMsg, setInspectingMsg] = useSharedState<string | null>(InspectingMsgStateKey, null);
  const [overrideEditUpdateDialogueId, setOverrideEditUpdateDialogueId] = React.useState<string | null>(null);
  const autoScrollUpdate = useAutoScrollUpdateSignal();
  const hasAdmin = getCredentialManager().has_admin_auth;
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
        let handleEdit, handleCloseEdit, handleInspect, handleCloseInspect, handleEditItem;
        const editingCurrMsg = editingMsg === message.id;
        const inspectingCurrMsg = inspectingMsg === message.id;
        if (hasAdmin && enable_buttons) {
          handleEdit = () => {
            setOverrideEditUpdateDialogueId(null);
            setEditingMsg(message.id);
            if (inspectingCurrMsg) {
              setInspectingMsg(null);
            }
            autoScrollUpdate();
          };
          handleInspect = () => {
            setInspectingMsg(message.id);
            autoScrollUpdate();
          };
          handleCloseEdit = () => {
            setOverrideEditUpdateDialogueId(null);
            setEditingMsg(null);
            autoScrollUpdate();
          };
          handleCloseInspect = () => {
            setInspectingMsg(null);
            autoScrollUpdate();
          };
          handleEditItem = (dialogue_id: string) => {
            setOverrideEditUpdateDialogueId(dialogue_id);
            setEditingMsg(message.id);
            setInspectingMsg(null);
            autoScrollUpdate();
          };
        }
        let lastUserMessage = null;
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
              handleEdit={handleEdit}
              handleInspect={handleInspect}
              editing={editingCurrMsg}
              inspecting={inspectingCurrMsg}
              enableButtons={enable_buttons}
            />
            {inspectingCurrMsg ? (
              <React.Suspense fallback={msg_edit_suspense}>
                <MessageInspectComponent message={message} onClose={handleCloseInspect} onEdit={handleEditItem} />
              </React.Suspense>
            ) : null}
            {editingCurrMsg ? (
              <React.Suspense fallback={msg_edit_suspense}>
                <MessageEditComponent
                  message={message}
                  userMessage={lastUserMessage}
                  onClose={handleCloseEdit}
                  defaultUpdateId={overrideEditUpdateDialogueId}
                />
              </React.Suspense>
            ) : null}
          </React.Fragment>
        );
      })}
    </>
  );
}
