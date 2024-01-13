import React from "react";
import * as classes from "./chatInitialBanner.module.css";
import { ChatInitialBannerContent, HomePageHeader } from "app/client_config";
import { useChatController } from "./contexts";

export default function ChatInitialBanner(): JSX.Element {
  const chatController = useChatController();

  return (
    <div className={classes.container}>
      <HomePageHeader />
      <ChatInitialBannerContent />
    </div>
  )
}
