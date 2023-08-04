import { Message } from "app/openapi";
import classes from "./chatMessagesList.module.css"
import { Body2, Button, Text } from "@fluentui/react-components";
import { Edit16Filled, Edit16Regular, EditRegular } from "@fluentui/react-icons";

interface MessageComponentProps {
  message: Message;
  handle_edit?: () => void;
};

export interface Props {
  messages_list: Message[];
  enable_buttons: boolean;
}

function MessageComponent({ message, handle_edit }: MessageComponentProps) {
  const box = (
    <div className={classes.box}>
      <Text weight={message.msg_type == "user" ? "semibold" : "regular"} size={400} strikethrough={message.exclude_from_generation}>{message.content}</Text>
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
      (message.exclude_from_generation ? ` ${classes.excludedMsg}` : "")
    }>
      {message.msg_type === "user" ? buttons : box}
      {message.msg_type === "user" ? box : buttons}
    </div>
  )
}

export default function ChatMessagesList({ messages_list, enable_buttons }: Props) {
  return (
    <>
      {messages_list.map((message) => (
        <MessageComponent key={message.id} message={message} handle_edit={() => { }} />
      ))}
    </>
  );
}
