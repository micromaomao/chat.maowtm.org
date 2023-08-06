import React, { useEffect, useState } from "react";
import { Body2, Button, Caption1, Skeleton, SkeletonItem, Text, Title2 } from "@fluentui/react-components";
import { LoaderFunction, redirect, useNavigate } from "react-router-dom";
import { getCredentialManager } from "app/utils/credentials";
import { generateToken } from "lib/secure_token/browser";
import * as classes from "./login.module.css";

const loader: LoaderFunction = async () => {
  if (getCredentialManager().has_admin_auth) {
    throw redirect("/admin");
  }
  return {};
};

function Component() {
  const navigate = useNavigate();
  const [token, setToken] = useState<string | null>(null);
  const [tokenHash, setTokenHash] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!tokenHash) {
        let tok_res = await generateToken();
        if (!cancelled) {
          setToken(tok_res.token_str);
          setTokenHash(tok_res.hash_b64);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tokenHash])

  function handleLogin() {
    getCredentialManager().admin_token = token;
    navigate("/admin", { replace: true });
  }

  return (
    <div className={classes.container}>
      <Title2 as="h2">Login</Title2>
      <br />
      {!token ? (
        <Skeleton>
          <SkeletonItem />
        </Skeleton>
      ) : (
        <>
          <Body2>To login as admin, insert the following row into the database:</Body2>
          <br />
          <Text font="monospace" style={{whiteSpace: "pre-wrap"}}>
            insert into admin_token (token, expiry)
              values (decode('<span className={classes.hidden}>{tokenHash}</span>', 'base64'), 'now'::timestamptz + '14 days'::interval);
          </Text>
          <br />
          <Body2>Then click the following button:</Body2>
          <br />
          <Button onClick={handleLogin}>Login</Button>
          <br />
          <Caption1>
            Sidenote: there is no actual secure shown here - the token shown is the sha256 of the real token.
          </Caption1>
        </>
      )}
    </div>
  );
}

export { Component, loader };
