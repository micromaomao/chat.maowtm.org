import React, { Suspense } from "react";
import { Body2, Button, Card, Skeleton, SkeletonItem, Subtitle1, Text, Title2 } from "@fluentui/react-components";
import * as classes from "./home.module.css";
import { AdminService, ApiError, ListChatSessionsResponse, Message, MetricsResponse } from "app/openapi";
import { Await, Link, defer, useAsyncError, useLoaderData, useNavigate, useRouteError } from "react-router-dom";
import { Alert } from "@fluentui/react-components/unstable";
import ChatMessagesList from "app/components/chatMessagesList";
import { decodeTime } from "ulid";
import { Humantime } from "app/utils/humantime";
import StartNewChatButton from "app/components/startNewChatButton";
import { useToastController, Toast, ToastTitle, ToastBody } from "@fluentui/react-toast";
import { transformApiResponse } from "app/utils/apires";

function getSessionList(until?: string) {
  return transformApiResponse(AdminService.getListChatSessions(20, until));
}

function getMetrics() {
  return transformApiResponse(AdminService.getMetrics());
}

export async function loader({ params }) {
  const sessions_data = getSessionList();
  const metrics = getMetrics();

  return defer({ sessions_data, metrics });
}

function AsyncErrorElement() {
  const error = useAsyncError();
  const navigate = useNavigate();
  return (
    <div>
      <Alert intent="error" action={
        <Button onClick={() => navigate(0)}>Reload</Button>
      }>
        {error ? error.toString() : "An error occured"}
      </Alert>
    </div>
  );
}

export function Component() {
  const { sessions_data, metrics } = useLoaderData() as any;
  const [hasMore, setHasMore] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [moreData, setMoreData] = React.useState<any[]>([]);
  const toastController = useToastController();
  return (
    <div>
      <Title2 as="h2">Stats</Title2>
      <Suspense fallback={
        <Skeleton>
          <SkeletonItem />
        </Skeleton>
      }>
        <Await resolve={metrics} errorElement={<AsyncErrorElement />}>
          {(data: MetricsResponse) => (
            <div className={classes.stats}>
              <div className={classes.stat}>
                <Body2>Total chat sessions</Body2>
                <Text className={classes.statNumber}>{data.total_sessions}</Text>
              </div>
              <div className={classes.stat}>
                <Body2>Total user messages</Body2>
                <Text className={classes.statNumber}>{data.total_user_messages}</Text>
              </div>
              <div className={classes.stat}>
                <Body2>Total dialogue items</Body2>
                <Text className={classes.statNumber}>{data.total_dialogue_items}</Text>
              </div>
            </div>
          )}
        </Await>
      </Suspense>
      <br />
      <div className={classes.latestChatHeading}>
        <Title2 as="h2">Latest chats</Title2>
        <StartNewChatButton />
      </div>
      <Suspense fallback={
        <Skeleton className={classes.chatSkeleton}>
          <SkeletonItem />
          <SkeletonItem />
          <SkeletonItem />
          <SkeletonItem />
        </Skeleton>
      }>
        <Await resolve={sessions_data} errorElement={<AsyncErrorElement />}>
          {({ sessions: _data_sessions }: ListChatSessionsResponse) => {
            let sessions = [..._data_sessions, ...moreData];

            async function handleLoadMore() {
              if (!hasMore || loadingMore) return;
              setLoadingMore(true);
              let last = sessions[sessions.length - 1].session_id;
              try {
                let more = (await getSessionList(last)).sessions;
                let newMoreData = [...moreData, ...more];
                setMoreData(newMoreData);
                setHasMore(more.length > 0);
              } catch (e) {
                toastController.dispatchToast(
                  <Toast>
                    <ToastTitle>Failed to load more chats</ToastTitle>
                    <ToastBody>{e.toString()}</ToastBody>
                  </Toast>,
                  { intent: "error" }
                );
              } finally {
                setLoadingMore(false);
              }
            }
            return (
              <>
                <div className={classes.chats}>
                  {sessions.map(s => {
                    let link = `/chat/${encodeURIComponent(s.session_id)}`;
                    return (
                      <Card className={classes.chat} key={s.session_id} onClick={() => { }}>
                        <Link to={link}>
                          <div>
                            <Body2>
                              <Humantime time={decodeTime(s.session_id)} />
                            </Body2>
                          </div>
                          <div className={classes.chatMessages}>
                            <ChatMessagesList enable_buttons={false} messages_list={s.last_messages} shortMode={true} />
                          </div>
                        </Link>
                      </Card>
                    );
                  })}
                </div>
                {hasMore ? (
                  <div className={classes.loadMore}>
                    <Button size="large" onClick={handleLoadMore} disabled={loadingMore}>Load more</Button>
                  </div>
                ) : null}
              </>
            );
          }}
        </Await>
      </Suspense>
    </div>
  );
}
