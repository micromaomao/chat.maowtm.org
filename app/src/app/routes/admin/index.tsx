import React from "react";
import { LoaderFunction, Outlet, RouteObject, redirect, useLocation, useNavigate } from "react-router-dom";
import * as classes from "./index.module.css";
import { SharedStateProvider } from "app/utils/sharedstate";
import { Tab, TabList, SelectTabEventHandler } from "@fluentui/react-components";
import { ArrowHookDownLeftRegular, CodeRegular, bundleIcon, Home24Regular, Home24Filled, PersonFilled, SettingsRegular } from "@fluentui/react-icons";
import { getCredentialManager } from "app/utils/credentials";
import { useWindowSize } from "app/utils/windowHooks";
const HomeIcon = bundleIcon(Home24Filled, Home24Regular);

const path = "/admin";

const children: RouteObject[] = [
  {
    path: "",
    lazy: () => import("./home"),
  },
  {
    path: "login",
    lazy: () => import("./login"),
  },
  {
    path: "settings",
    lazy: () => import("./settings"),
  },
  {
    path: "debug",
    lazy: () => import("./debug"),
  },
];

const loader: LoaderFunction = async ({ request }) => {
  const isLogin = new URL(request.url).pathname == "/admin/login";
  if (!isLogin && !getCredentialManager().has_admin_auth) {
    throw redirect("/admin/login");
  }
  return {};
};

function Nav() {
  let isOnLoginPage = false;
  let currentValue = null;
  const loc = useLocation();
  const navigate = useNavigate();
  const pathname = loc.pathname.replace(/^\/admin\/?/, "");
  for (const route of children) {
    if (pathname == route.path) {
      currentValue = route.path;
      if (route.path == "") {
        currentValue = "home";
      }
      if (route.path == "login") {
        isOnLoginPage = true;
      }
      break;
    }
  }

  const { width } = useWindowSize();
  const smallMode = width < 700;

  const onTabSelect: SelectTabEventHandler = (_, tab) => {
    switch (tab.value) {
      case "back":
        navigate("/");
        break;
      case "home":
        navigate("/admin");
        break;
      case "login":
        break;
      case "logout":
        getCredentialManager().admin_token = null;
        navigate("/admin/login");
        break;
      default:
        navigate("/admin/" + tab.value);
        break;
    }
  };

  function constructTab(value: string, label: string, icon: React.ReactElement) {
    if (smallMode) {
      return <Tab value={value} icon={icon} title={label} />;
    }
    return <Tab value={value} icon={icon}>{label}</Tab>;
  }

  return (
    <TabList size="large" selectedValue={currentValue} vertical={true} onTabSelect={onTabSelect} appearance="transparent">
      {constructTab("back", "Back to chat", <ArrowHookDownLeftRegular />)}
      {isOnLoginPage ? (
        constructTab("login", "Login", <PersonFilled />)
      ) : (
        <>
          {constructTab("home", "Dashboard", <HomeIcon />)}
          {constructTab("settings", "Settings", <SettingsRegular />)}
          {constructTab("debug", "Debug", <CodeRegular />)}
          {constructTab("logout", "Logout", null)}
        </>
      )}
    </TabList>
  );
}

function Component() {
  return (
    <div className={classes.container}>
      <SharedStateProvider sessionStorageId="admin-ui-state">
        <nav className={classes.nav}>
          <Nav />
        </nav>
        <main className={classes.main}>
          <Outlet />
        </main>
      </SharedStateProvider>
    </div>
  );
}

export { path, loader, Component, children };
