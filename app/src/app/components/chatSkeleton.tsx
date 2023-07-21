import React from "react";
import { Skeleton, SkeletonItem } from "@fluentui/react-components";
import * as classes from "./chatSkeleton.module.css";

export default function ChatSkeleton({ className }: { className?: string }) {
  return (
    <Skeleton as="div" className={classes.content + (className ? ` ${className}` : "")}>
      <div>
        <SkeletonItem shape='circle' size={40} />
      </div>
      <div className={classes.botMsg}>
        <SkeletonItem />
      </div>
      <div />
      <div />
      <div className={classes.userMsg}>
        <SkeletonItem style={{ width: "30%" }} />
      </div>
      <div>
        <SkeletonItem shape='circle' size={40} />
      </div>
      <div>
        <SkeletonItem shape='circle' size={40} />
      </div>
      <div className={classes.botMsg}>
        <SkeletonItem />
        <SkeletonItem style={{ width: "50%" }} />
      </div>
      <div />
      <div />
      <div className={classes.userMsg}>
        <SkeletonItem style={{ width: "60%" }} />
      </div>
      <div>
        <SkeletonItem shape='circle' size={40} />
      </div>
      <div>
        <SkeletonItem shape='circle' size={40} />
      </div>
      <div className={classes.botMsg}>
        <SkeletonItem style={{ width: "80%" }} />
      </div>
      <div />
    </Skeleton>
  );
}
