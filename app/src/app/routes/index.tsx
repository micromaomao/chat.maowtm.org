import { Alert } from "@fluentui/react-components/unstable";
import { Button } from "@fluentui/react-components";
import React from 'react';
import {
  RouteObject,
  RouterProvider,
  createBrowserRouter,
  useRouteError,
  useNavigate
} from "react-router-dom";
import * as adminPath from "./admin";

function ErrorBoundary() {
  const error = useRouteError();
  const navigate = useNavigate();
  if (error.status == 404) {
    return (
      <div>
        <Alert
          intent="error"
          action={<Button onClick={() => navigate("/")}>Return to home</Button>}
        >
          Page not found
        </Alert>
      </div>
    );
  }
  return (
    <div>
      <Alert
        intent="error"
        action={<Button onClick={() => window.location.reload()}>Refresh</Button>}
      >
        Something went wrong&hellip;
      </Alert>
      <pre>{error.toString()}</pre>
    </div>
  );
}

const routes: RouteObject[] = [
  {
    ErrorBoundary,
    children: [
      {
        path: "/",
        lazy: () => import("./home"),
      },
      {
        path: "/chat/:chatId",
        lazy: () => import("./chat"),
      },
      adminPath,
    ]
  }
];

const router = createBrowserRouter(routes);

export default function Routes() {
  return <RouterProvider router={router} />;
}
