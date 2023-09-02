import React, { Suspense } from "react";
import { Link as FluentLink, Skeleton, SkeletonItem } from "@fluentui/react-components";
const StartNewChatButton = React.lazy(() => import("app/components/startNewChatButton"));
import * as classes from "./home.module.css";
import { Link } from "react-router-dom";
import { HomePageFooter, HomePageHeader } from "app/client_config";

function Component() {
  return (
    <div className={classes.container}>
      <HomePageHeader />
      <Suspense fallback={<SuspenseContent />}>
        <StartNewChatButton size="large" appearance="primary" />
      </Suspense>
      <HomePageFooter />
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
