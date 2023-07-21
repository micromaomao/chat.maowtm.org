import React from "react";
import { useLoaderData } from "react-router-dom";

interface Data {
  chatId: string
}

async function loader({ params }): Promise<Data> {
  const { chatId } = params;
  return {
    chatId
  };
}

function Component() {
  const data = useLoaderData() as Data;
  return (
    <div>Chat {data.chatId}</div>
  );
}

export { loader, Component };
