import React, { Suspense } from "react";
import { Body1, Body2, Image, Link as FluentLink, Skeleton, SkeletonItem, Title1 } from "@fluentui/react-components";
const StartNewChatButton = React.lazy(() => import("app/components/startNewChatButton"));
import avatarDistored from "app/../../assets/avatar_distorted.png"
import * as classes from "./home.module.css";
import { ChatSparkleRegular, PersonCircleRegular, WarningFilled } from "@fluentui/react-icons";
import { Link } from "react-router-dom";

function Component() {
  return (
    <div className={classes.container}>
      <Image src={avatarDistored} style={{ width: "100px", height: "100px" }} fit="contain" />
      <Title1 align="center">Chat with an AI version of me</Title1>
      <Suspense fallback={<SuspenseContent />}>
        <StartNewChatButton size="large" appearance="primary" />
      </Suspense>
      <div style={{ height: "20px", flexShrink: "1", flexGrow: "0" }} />
      <div className={classes.box}>
        <ChatSparkleRegular className={classes.icon} />
        <Body2 className={classes.text}>
          You can ask it questions about me personally, and in many cases it is
          capable of generating a good answer.
        </Body2>
      </div>
      <div className={classes.box}>
        <WarningFilled className={classes.icon} />
        <Body2 className={classes.text}>
          Due to how LLM works, generated output may not be true, or may be
          complete nonsense. Please do not take anything seriously.
        </Body2>
      </div>
      <div className={classes.box}>
        <PersonCircleRegular className={classes.icon} />
        <Body2 className={classes.text}>
          Your chat with the AI is completely anonymous, but messages may be
          used later to fine-tune the AI. This allows me to improve it further.
        </Body2>
      </div>
      <Body1>Currently powered by OpenAI.</Body1>
      <div>
        <Link to="/admin" className={classes.adminLogin}>
          <FluentLink>Admin Login</FluentLink>
        </Link>
      </div>
    </div >
  );
}

function SuspenseContent() {
  return (
    <Skeleton>
      <SkeletonItem style={{ width: "150px", height: "40px" }} />
    </Skeleton>
  )
}

export { Component };
