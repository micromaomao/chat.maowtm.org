import React from 'react';
import ChatSkeleton from './components/chatSkeleton';
import * as classes from "./loadingPage.module.css";

export default function LoadingPage() {
  return (
    <div className={classes.container}>
      <ChatSkeleton />
    </div>
  );
}
