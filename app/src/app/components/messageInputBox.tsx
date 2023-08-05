import { Button, Caption1, Textarea } from '@fluentui/react-components';
import React from 'react';
import * as classes from './messageInputBox.module.css';
import { SendFilled } from '@fluentui/react-icons';
import { useChatCredentials } from 'app/utils/credentials';

interface P {
  chat_id: string;
  suggestions: string[];
  onSend: (message: string) => void;
  show_shadow?: boolean;
}

export default function MessageInputBox({ chat_id, suggestions, onSend, show_shadow }: P) {
  const chat_token = useChatCredentials(chat_id);
  const can_reply = !!chat_token;
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
  if (text.trim().length === 0 || text.length > max_length || !can_reply) {
    sendDisabled = true;
  }

  function handleSend() {
    if (sendDisabled) {
      return;
    }
    onSend(text);
    setText("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key == "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className={classes.container + (show_shadow ? ` ${classes.shadow}` : "")}>
      <div className={classes.suggestionRow}>
        {suggestions.map(sugg => {
          function handleSelect() {
            if (text == sugg) {
              handleSend();
            } else {
              setText(sugg);
            }
          }
          return (
            <Button
              appearance="outline"
              shape="rounded"
              key={sugg}
              disabled={!can_reply}
              onClick={handleSelect}
            >{sugg}</Button>
          );
        })}
      </div>
      <div className={classes.textRow}>
        <Textarea
          className={classes.textarea}
          value={text}
          onChange={handleChange}
          size="large"
          disabled={!can_reply}
          onKeyDown={handleKeyDown}
        />
      </div>
      <div className={classes.sendRow}>
        {can_reply ? <Caption1 style={char_count_style}>{text.length}/{max_length}</Caption1> : null}
        <div style={{ margin: "0 auto 0 auto" }} />
        <Button appearance="transparent" icon={<SendFilled />} disabled={sendDisabled} aria-label="Send" title="Send" onClick={handleSend} />
      </div>
    </div>
  )
}
