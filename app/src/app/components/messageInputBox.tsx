import { Button, Caption1, Textarea } from '@fluentui/react-components';
import React, { useRef, useState } from 'react';
import * as classes from './messageInputBox.module.css';
import { LightbulbFilament24Regular, LightbulbFilamentRegular, SendFilled } from '@fluentui/react-icons';
import { useChatCredentials } from 'app/utils/credentials';
import { useSharedState } from 'app/utils/sharedstate';
import StartNewChatButton from './startNewChatButton';
import { EditingMsgStateKey, InspectingMsgStateKey } from './chatMessagesList';
import { useWindowSize } from 'app/utils/windowHooks';

interface P {
  chat_id: string;
  suggestions: string[];
  onSend: (message: string) => void;
  show_shadow?: boolean;
}

export default function MessageInputBox({ chat_id, suggestions, onSend, show_shadow }: P) {
  const chat_token = useChatCredentials(chat_id);
  const can_reply = !!chat_token;
  const [text, setText] = useSharedState("chatText", chat_token ? "" : "Can't add message to this chat.");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [editingMsg] = useSharedState<string | null>(EditingMsgStateKey, null);
  const [inspectingMsg] = useSharedState<string | null>(InspectingMsgStateKey, null);

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

  const [focused, setFocused] = useState(false);

  function handleFocused() {
    setFocused(true);
  }
  function handleBlur() {
    setFocused(false);
  }

  function handleSend() {
    if (sendDisabled) {
      return;
    }
    onSend(text);
    setText("");
    textareaRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key == "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleSelectSuggestion(sugg: string) {
    if (text == sugg) {
      handleSend();
    } else {
      setText(sugg);
      textareaRef.current?.focus();
    }
  }

  const { height } = useWindowSize();

  const hide = height <= 800 && (editingMsg !== null || inspectingMsg !== null) && !focused;

  return (
    <div className={classes.container + (show_shadow ? ` ${classes.shadow}` : "") + (hide ? ` ${classes.hide}` : "")}>
      <div className={classes.suggestionRow}>
        {suggestions.length > 0 ? (
          <LightbulbFilament24Regular color="var(--colorBrandForeground1)" />
        ) : null}
        {suggestions.map(sugg => {
          return (
            <Button
              appearance="transparent"
              shape="circular"
              key={sugg}
              disabled={!can_reply}
              onClick={handleSelectSuggestion.bind(null, sugg)}
              className={classes.suggestionBtn}
            >{sugg}</Button>
          );
        })}
        <div style={{ marginLeft: "auto" }} />
        <StartNewChatButton />
      </div>
      <div className={classes.textRow}>
        <Textarea
          className={classes.textarea}
          value={text}
          onChange={handleChange}
          size="large"
          disabled={!can_reply}
          onKeyDown={handleKeyDown}
          onFocus={handleFocused}
          onBlur={handleBlur}
          ref={textareaRef}
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
