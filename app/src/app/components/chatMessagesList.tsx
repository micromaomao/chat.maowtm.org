import React from "react";
import { Message, MessageType } from "app/openapi";
import classes from "./chatMessagesList.module.css"
import { Button, Spinner, Text, Tooltip } from "@fluentui/react-components";
import { Edit16Filled, Edit16Regular, ErrorCircle20Regular, ErrorCircleFilled } from "@fluentui/react-icons";
import { useState } from "react";
import MessageEditComponent from "./messageEdit";
import { useAutoScrollUpdateSignal } from "./autoScroll";

interface MessageComponentProps {
  message: Message;
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

export function MessageComponent({ message, handle_edit, editing }: MessageComponentProps) {
  const box = (
    <div className={classes.box}>
      <Text weight={message.msg_type == "user" ? "semibold" : "regular"} size={400} strikethrough={message.exclude_from_generation} style={{ whiteSpace: "pre-wrap" }}>{message.content}</Text>
    </div>
  );
  const buttons = (
    <div className={classes.buttons}>
      {(handle_edit && message.msg_type == "bot" && message.metadata) ?
        <Button
          onClick={handle_edit}
          icon={message.metadata?.updated_before ? <Edit16Filled /> : <Edit16Regular />}
          appearance="transparent"
          title="Improve this message"
          size="small"
        />
        : null}
    </div>
  )
  return (
    <div className={
      classes.message + " " + classes[`msgType_${message.msg_type}`] +
      (message.exclude_from_generation ? ` ${classes.excludedMsg}` : "") +
      (editing ? ` ${classes.editingMsg}` : "")
    }>
      {message.msg_type === "user" ? buttons : box}
      {message.msg_type === "user" ? box : buttons}
    </div>
  )
}

export function PhantomMessageComponent({ message, onRetry }: { message: PhantomMessage, onRetry: (msg: PhantomMessage) => void }) {
  const box = (
    <div className={classes.box}>
      <Text weight={message.msg_type == "user" ? "semibold" : "regular"} size={400} style={{ whiteSpace: "pre-wrap" }}>{message.content}</Text>
    </div>
  );
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
      {message.msg_type === "user" ? buttons : box}
      {message.msg_type === "user" ? box : buttons}
    </div>
  );
}

export default function ChatMessagesList({ messages_list, enable_buttons }: Props) {
  const [editingMsg, setEditingMsg] = useState<string | null>(null);
  const autoScrollUpdate = useAutoScrollUpdateSignal();
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
            <MessageComponent message={message} handle_edit={enable_buttons ? handleEdit : undefined} editing={editingCurrMsg} />
            {editingCurrMsg ? (
              <MessageEditComponent message={message} userMessage={lastUserMessage} onClose={handleClose} />
            ) : null}
          </React.Fragment>
        );
      })}
    </>
  );
}
