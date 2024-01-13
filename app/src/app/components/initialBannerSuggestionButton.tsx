import React from "react";
import * as classes from "./initialBannerSuggestionButton.module.css";
import { useChatController } from "./contexts";
import { Text } from "@fluentui/react-components";

export interface P {
  children: React.ReactNode;
}

export default function InitialBannerSuggestionButton({ children }: P): JSX.Element {
  const chatController = useChatController();
  const ref = React.useRef<HTMLDivElement>(null);
  function handleClick() {
    chatController.simulateInputBoxSuggestion(ref.current.innerText);
  }

  return (
    <div className={classes.container} ref={ref} onClick={handleClick}>
      <Text size={400}>
        {children}
      </Text>
    </div>
  );
}
