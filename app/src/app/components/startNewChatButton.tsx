import React from "react";
import { Button, Spinner } from "@fluentui/react-components";
import { useState } from "react";
import { startNewChat } from "app/utils/actions";
import * as classes from "./startNewChatButton.module.css";
import { ErrorCircleRegular } from "@fluentui/react-icons";
import { useNavigate } from "react-router-dom";

export default function StartNewChatButton() {
  const [starting, setStarting] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const navigate = useNavigate();
  async function handleClick() {
    if (starting) {
      return;
    }
    setStarting(true);
    setError(null);
    try {
      await startNewChat(navigate);
    } catch (e) {
      setStarting(false);
      setError(e);
    }
  }
  return (
    <div>
      <Button
        onClick={handleClick}
        disabled={starting}
        icon={starting ? <Spinner size="extra-tiny" /> : undefined}>
        Start new chat
      </Button>
      {error ? (<div className={classes.error}>
        <ErrorCircleRegular style={{ verticalAlign: "center" }} />
        <span>{error.message}</span>
      </div>) : null}
    </div>
  );
}
