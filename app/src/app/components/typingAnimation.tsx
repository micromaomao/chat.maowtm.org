import React, { useEffect, useState } from "react"
import * as classes from "./typingAnimation.module.css"
import { Body1 } from "@fluentui/react-components";

function Circle({ d }: { d: number }) {
  return (
    <div className={classes.circle} style={{ animationDelay: `${d * 100}ms` }}></div>
  );
}

export function TypingAnimationComponent() {
  return (
    <div className={classes.container}>
      <Circle d={0} />
      <Circle d={1} />
      <Circle d={2} />
      <span style={{ marginRight: "5px" }} />
      <Body1>AI is typing</Body1>
    </div>
  );
}

export function MaybeShowTyping({ expiryTime }: { expiryTime: number | null }) {
  let update = useState({})[1];
  useEffect(() => {
    let timer = null;
    if (expiryTime > Date.now()) {
      timer = setTimeout(() => {
        update({});
      }, expiryTime - Date.now());
    }
    return () => {
      if (timer !== null) clearTimeout(timer);
    };
  });
  if (expiryTime === null || Date.now() > expiryTime) {
    return null;
  }
  return (
    <TypingAnimationComponent />
  );
}
