import { Button, Caption1, Textarea } from '@fluentui/react-components';
import React from 'react';
import * as classes from './messageInputBox.module.css';
import { SendFilled } from '@fluentui/react-icons';
import { useChatCredentials } from 'app/utils/credentials';

interface P {
  chat_id: string;
}

export default function MessageInputBox({ chat_id }: P) {
  const chat_token = useChatCredentials(chat_id);
  const [text, setText] = React.useState(chat_token ? "" : "Can't add message to this chat.")
  function handleChange(_, data) {
    let text = data.value;
    setText(text);
  }
  const max_length = 1000;
  let char_count_style;
  if (text.length > max_length) {
    char_count_style = { color: "#bc2f32" };
  } else if (text.length < max_length * 0.5) {
    char_count_style = { color: "#aaa" };
  }
  let sendDisabled = false;
  if (text.length === 0 || text.length > max_length || !chat_token) {
    sendDisabled = true;
  }
  return (
    <div className={classes.container}>
      <div className={classes.textRow}>
        <Textarea className={classes.textarea} value={text} onChange={handleChange} size="large" disabled={!chat_token} />
      </div>
      <div className={classes.sendRow}>
        {chat_token ? <Caption1 style={char_count_style}>{text.length}/{max_length}</Caption1> : null}
        <div style={{ margin: "0 auto 0 auto" }} />
        <Button appearance="transparent" icon={<SendFilled />} disabled={sendDisabled} aria-label="Send" title="Send" />
      </div>
    </div>
  )
}
