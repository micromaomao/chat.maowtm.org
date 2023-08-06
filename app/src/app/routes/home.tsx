import { Body1, Body2, Title1 } from "@fluentui/react-components";
import StartNewChatButton from "app/components/startNewChatButton";
import React from "react";

function Component() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "15px", justifyContent: "center", alignItems: "center", height: "100vh" }}>
      <Title1>Chat with an AI version of me</Title1>
      <Body2>Experimental, please use common sense :)</Body2>
      <Body1>Note that your messages may be used later to fine-tune the AI, but this is completely anonymous.</Body1>
      <StartNewChatButton size="large" appearance="primary" />
      <Body1>Currently powered by OpenAI.</Body1>
    </div>
  );
}

export { Component };
