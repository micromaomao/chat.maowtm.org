import React from "react";
import { Button, Title2 } from "@fluentui/react-components";
import { LoaderFunction, redirect, useNavigate } from "react-router-dom";

const loader: LoaderFunction = async () => {
  if (localStorage.getItem("admin-token")) {
    throw redirect("/admin");
  }
  return {};
};

function Component() {
  const navigate = useNavigate();
  function handleMockLogin() {
    localStorage.setItem("admin-token", "mock");
    navigate("/admin", { replace: true });
  }

  return (
    <div>
      <Title2 as="h2">Login</Title2>
      <br />
      <Button onClick={handleMockLogin}>Login</Button>
    </div>
  );
}

export { Component, loader };
