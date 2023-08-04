import { ChatController } from "app/components/chatController";
import React from "react";
import { useLoaderData } from "react-router-dom";

async function loader({ params }): Promise<any> {
  return { chat_id: params.chatId };
}

function Component() {
  const { chat_id } = useLoaderData() as any;
  return <ChatController chat_id={chat_id} />;
}

export { loader, Component };
