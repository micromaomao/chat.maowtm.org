import React, { createContext, useContext, useEffect, useState } from "react";
import { Message, MessageMatchResultMatchTree, ReplyAnalysis } from "app/openapi";

import * as classes from "./messageInspect.module.css";
import { Body1, Body1Strong, Body2, Button, Skeleton, SkeletonItem, Subtitle1, Subtitle2 } from "@fluentui/react-components";
import { DismissRegular, Edit16Regular } from "@fluentui/react-icons";
import { Alert } from "@fluentui/react-components/unstable";
import { useAutoScrollUpdateSignal } from "./autoScroll";
import { MessageButton } from "./chatMessagesList";
import { useReplyAnalysis } from "app/utils/replyAnalysis";

interface P {
  message: Message;
  onClose: () => void;
  onEdit?: (item_id: string) => void;
}

function TreeSkeleton() {
  return (
    <Skeleton className={classes.treeSkeleton}>
      <div>
        <SkeletonItem className={classes.treeSkeletonItem} style={{ width: "40%" }} />
      </div>
      <div style={{ marginLeft: "20px" }}>
        <SkeletonItem className={classes.treeSkeletonItem} style={{ width: "20%" }} />
      </div>
      <div style={{ marginLeft: "40px" }}>
        <SkeletonItem className={classes.treeSkeletonItem} style={{ width: "30%" }} />
      </div>
      <div style={{ marginLeft: "20px", marginTop: "10px" }}>
        <SkeletonItem className={classes.treeSkeletonItem} style={{ width: "35%" }} />
      </div>
      <div style={{ marginLeft: "40px" }}>
        <SkeletonItem className={classes.treeSkeletonItem} style={{ width: "50%" }} />
      </div>
    </Skeleton>
  );
}

const onEditContext = createContext<((item_id: string) => void | undefined)>(undefined);

export default function MessageInspectComponent({ message, onClose, onEdit }: P) {
  const { loading, error, data, retry } = useReplyAnalysis(message.id);
  const autoScrollUpdate = useAutoScrollUpdateSignal();
  useEffect(autoScrollUpdate, [loading, error, data]);

  return (
    <onEditContext.Provider value={onEdit}>
      <div className={classes.container}>
        <div className={classes.headingRow}>
          <Subtitle1>Reply analysis</Subtitle1>
          <Button icon={<DismissRegular />} appearance="transparent" onClick={onClose} />
        </div>
        {error ? (
          <Alert intent="error" action={
            <Button onClick={retry}>Retry</Button>
          }>
            {error.message}
          </Alert>
        ) : (
          <div>
            {loading ? (
              <TreeSkeleton />
            ) : (
              data ? (
                <ReplyAnalysisDataComponent data={data} />
              ) : null
            )}
          </div>
        )}
      </div>
    </onEditContext.Provider>
  )
}

interface DataComponentP {
  data: ReplyAnalysis;
}

function ReplyAnalysisDataComponent({ data }: DataComponentP) {
  const [limit, setLimit] = useState(5);
  useEffect(() => {
    setLimit(5);
  }, [data]);

  const autoScrollUpdate = useAutoScrollUpdateSignal();

  function handleShowMore() {
    setLimit(limit + 5);
    autoScrollUpdate();
  }

  return <>
    <div className={classes.subheading}>
      <Subtitle2>Model sample input</Subtitle2>
    </div>
    {data.match_result.available ? (
      <div>
        {data.match_result.match_trees.map((tree, i) => {
          if (i >= limit) return null;
          return <MatchTreeNodeComponent key={tree.this_item} node={tree} />
        })}
        {data.match_result.match_trees.length > limit ? (
          <Button onClick={handleShowMore}>Show more</Button>
        ) : null}
      </div>
    ) : (
      <Body1>Reconstructed match tree not available.</Body1>
    )}
    <hr className={classes.divider} />
    {data.suggestions.length > 0 ? (
      <>
        <div className={classes.subheading}>
          <Subtitle2>Suggestions</Subtitle2>
        </div>
        <ol>
          {data.suggestions.map((suggestion, i) => (
            <li key={i}>
              <Body2>{suggestion}</Body2>
            </li>
          ))}
        </ol>
      </>
    ) : (
      <Body1>No suggestions generated.</Body1>
    )}
  </>;
}

function MatchTreeNodeComponent({ node }: { node: MessageMatchResultMatchTree }) {
  let scoreInherited = node.max_score == Math.max(...node.children.map(child => child.max_score));
  const onEdit = useContext(onEditContext);
  return (
    <div className={
      classes.matchTreeNode +
      (scoreInherited ? ` ${classes.scoreInherited}` : "") +
      (node.children.length > 0 ? ` ${classes.hasChildren}` : "")
    }>
      <Body1Strong className={classes.nodeScore}>{scoreInherited ? "-" : node.max_score.toFixed(4)}</Body1Strong>
      <Body2 className={classes.nodeQText}>{node.selected_phrasing}</Body2>
      <div className={classes.nodeBtns}>
        <MessageButton
          show={true}
          icon={<Edit16Regular />}
          title="Edit this dialogue item"
          onClick={onEdit ? onEdit.bind(undefined, node.this_item) : undefined}
          disabled={!onEdit}
        />
      </div>
      <Body1 style={{ overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }} className={classes.nodeResponse}>{node.response}</Body1>
      <div className={classes.nodeChildren}>
        {node.children.map(child => (
          <MatchTreeNodeComponent key={child.this_item} node={child} />
        ))}
      </div>
    </div>
  );
}
