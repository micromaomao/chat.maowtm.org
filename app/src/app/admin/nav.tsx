"use client"

import { Tab, TabList, ArrowHookDownLeftRegular, CodeRegular, SelectTabEventHandler, bundleIcon, Home24Regular, Home24Filled, LockClosedFilled } from "@/app/uicomponents"
const HomeIcon = bundleIcon(Home24Filled, Home24Regular);
import { usePathname, useRouter } from "next/navigation"
import { useEffect } from "react";

export default function Nav() {
  const router = useRouter();
  let pathname = usePathname();
  if (pathname.endsWith("/")) {
    pathname = pathname.slice(0, -1);
  }

  const onTabSelect: SelectTabEventHandler = (_, tab) => {
    switch (tab.value) {
      case "back":
        router.push("/");
        break;
      case "home":
        router.push("/admin");
        break;
      case "debug":
        router.push("/admin/debug");
        break;
    }
  };

  let currentValue = null;
  let isOnLoginPage = false;
  if (pathname === "/admin") {
    currentValue = "home";
  } else if (pathname === "/admin/debug") {
    currentValue = "debug";
  } else if (pathname === "/admin/login") {
    isOnLoginPage = true;
    currentValue = "login";
  }

  useEffect(() => {
    router.prefetch("/");
    if (!isOnLoginPage) {
      router.prefetch("/admin");
      router.prefetch("/admin/debug");
    }
  }, [isOnLoginPage])

  return (
    <TabList size="large" selectedValue={currentValue} vertical={true} onTabSelect={onTabSelect} appearance="transparent">
      <Tab value="back" icon={<ArrowHookDownLeftRegular />}>Back to chat</Tab>
      {isOnLoginPage ? (
        <Tab value="login" icon={<LockClosedFilled />}>Login</Tab>
      ) : (
        <>
          <Tab value="home" icon={<HomeIcon />}>Dashboard</Tab>
          <Tab value="debug" icon={<CodeRegular />}>Debug</Tab>
        </>
      )}
    </TabList>
  )
}
