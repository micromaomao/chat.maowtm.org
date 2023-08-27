import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Button, Field, SelectTabData, Skeleton, SkeletonItem, Tab, TabList, Textarea, TextareaOnChangeData, Title2, Toast, ToastBody, ToastTitle, useToastController } from "@fluentui/react-components";

import * as classes from "./settings.module.css";
import { useSharedState } from "app/utils/sharedstate";
import { BracesFilled, TextboxRegular } from "@fluentui/react-icons";
import { OpenAPI } from "app/openapi";
import { Alert } from "@fluentui/react-components/unstable";

function loadCurrentConfig(): Promise<{ id: string, config: any }> {
  return fetch("/api/v1/global-config", { headers: { ...OpenAPI.HEADERS } }).then(async r => {
    if (r.status != 200) {
      let body = await r.text();
      throw new Error(`Failed to load config: ${r.status} ${r.statusText} - ${body}`);
    } else {
      let config = await r.json();
      let id = r.headers.get("ETag");
      return { id, config };
    }
  });
}

interface ConfigContext {
  loading: boolean;
  saving: boolean;
  config?: any;
  configId?: string;
  error?: Error;
}

interface ConfigActions {
  refresh(): void;
  save(updateFunction: (config: any) => any);
  markEdited(edited?: boolean): void;
}

const configContext = createContext<ConfigContext | null>(null);
const configActions = createContext<ConfigActions | null>(null);

function Component() {
  const [currentTab, setCurrentTab] = useSharedState("admin.settings.tab", "prompt");
  const [configCtx, setConfigCtx] = useState<ConfigContext>({
    loading: true,
    saving: false,
  });
  const [edited, setEdited] = useState(false);
  const toastController = useToastController();

  function handleConfigRefresh() {
    setConfigCtx({ loading: true, saving: false });
    setEdited(false);
    loadCurrentConfig().then(({ id, config }) => {
      setConfigCtx({ config, configId: id, loading: false, saving: false });
    }, err => {
      setConfigCtx({ error: err, loading: false, saving: false });
    });
  }

  async function handleSave(updateFunction: (config: any) => any) {
    if (!configCtx.config) {
      return;
    }
    let tries = 0;
    let updatedConfig = updateFunction(configCtx.config);
    let ifMatch = configCtx.configId;
    setConfigCtx({ ...configCtx, saving: true });
    try {
      while (tries < 2) {
        let res = await fetch("/api/v1/global-config", {
          headers: {
            ...OpenAPI.HEADERS,
            "If-Match": ifMatch,
            "Content-Type": "application/json"
          },
          method: "PUT",
          body: JSON.stringify(updatedConfig),
        });
        if (res.status == 200 || res.status == 204) {
          toastController.dispatchToast(
            <Toast>
              <ToastTitle>Settings saved</ToastTitle>
            </Toast>,
            { intent: "success" }
          );
          setConfigCtx({ ...configCtx, saving: false });
          handleConfigRefresh();
          return;
        }
        if (res.status == 412) {
          let latestConfig = await loadCurrentConfig();
          updatedConfig = updateFunction(latestConfig.config);
          ifMatch = latestConfig.id;
          tries += 1;
          continue;
        }
        let body = await res.text();
        throw new Error(`${res.status} ${res.statusText} ${body}`);
      }
    } catch (e) {
      setConfigCtx({ ...configCtx, saving: false });
      toastController.dispatchToast(
        <Toast>
          <ToastTitle>Failed to save settings</ToastTitle>
          <ToastBody>{e.toString()}</ToastBody>
        </Toast>,
        { intent: "error" }
      );
    }
  }

  useEffect(() => {
    handleConfigRefresh();
  }, []);

  function handleSelectTab(evt, data: SelectTabData) {
    if (currentTab == data.value) {
      return;
    }
    setCurrentTab(data.value as string);
    setEdited(false);
  }

  const currentTabComponent = {
    prompt: <PromptSettingTab />,
    rawConfig: <RawConfigTab />,
  }[currentTab];

  function handleMarkEdited(edited?: boolean) {
    setEdited(edited !== undefined ? edited : true);
  }

  return (
    <configContext.Provider value={configCtx}>
      <configActions.Provider value={{ refresh: handleConfigRefresh, save: handleSave, markEdited: handleMarkEdited }}>
        <div className={classes.container}>
          <Title2 as="span">Settings</Title2>
          <TabList selectedValue={currentTab} onTabSelect={handleSelectTab}>
            <Tab value="prompt" icon={<TextboxRegular />}>Prompt{edited && currentTab == "prompt" ? "*" : null}</Tab>
            <Tab value="rawConfig" icon={<BracesFilled />}>Edit JSON config{edited && currentTab == "rawConfig" ? "*" : null}</Tab>
          </TabList>

          {configCtx.loading ? (
            <Skeleton style={{ padding: "20px" }}>
              <SkeletonItem />
              <SkeletonItem style={{ marginTop: "10px" }} />
              <SkeletonItem style={{ marginTop: "10px" }} />
              <SkeletonItem style={{ marginTop: "10px" }} />
            </Skeleton>
          ) : null}
          {configCtx.error ? (
            <Alert intent="error" action={
              <Button onClick={handleConfigRefresh}>Retry</Button>
            }>{configCtx.error.toString()}</Alert>
          ) : null}
          {configCtx.config ? currentTabComponent : null}
        </div>
      </configActions.Provider>
    </configContext.Provider>
  )
}

function PromptSettingTab() {
  const { config, saving } = useContext(configContext);
  const { save, markEdited } = useContext(configActions);
  const [prompt, setPrompt] = useState(config.prompt_template);
  const replacementText = "<|DIALOGUE_ITEMS|>";
  const promptValidationError = useMemo<string | undefined>(() => {
    if (prompt.indexOf(replacementText) == -1) {
      return `Prompt must contain the sample replacement text ${replacementText}`;
    }
    if (prompt.indexOf(replacementText) != prompt.lastIndexOf(replacementText)) {
      return `Prompt must contain only one instance of the sample replacement text ${replacementText}`;
    }
    return undefined;
  }, [prompt]);

  function handleChange(evt, data: TextareaOnChangeData) {
    setPrompt(data.value);
    markEdited();
  }

  function handleReset() {
    setPrompt(config.prompt_template);
    markEdited(false);
  }

  function handleSave() {
    save(conf => {
      return {
        ...conf,
        prompt_template: prompt,
      };
    });
  }

  return (
    <div className={classes.promptContainer}>
      <Field
        label="Prompt template"
        validationMessage={promptValidationError}
        validationState={promptValidationError ? "error" : undefined}
        hint={
          <>
            The prompt template is used as the system message at the beginning. It must contain the sample replacement text
            {replacementText}, which will be replaced with matched dialogue items.<br />
            You may tell the model to generate up to 3 suggestions in the form "Suggestion 1: ...", one per line at the end of the message.
            They will be parsed and displayed appropriately to the user.
          </>
        }
      >
        <Textarea
          value={prompt}
          onChange={handleChange}
          style={{ whiteSpace: "pre-wrap", width: "100%", height: "500px" }}
          textarea={{ style: { whiteSpace: "pre-wrap", width: "100%", height: "100%", maxHeight: "unset" } }} />
      </Field>
      <div className={classes.saveRow}>
        <Button
          appearance="primary"
          disabled={saving || !!promptValidationError}
          onClick={handleSave}>
          Save
        </Button>
        <Button
          appearance="secondary"
          onClick={handleReset}>
          Revert
        </Button>
      </div>
    </div>
  );
}

function RawConfigTab() {
  const { config, saving } = useContext(configContext);
  const { save, markEdited } = useContext(configActions);
  const [configInput, setConfigInput] = useState(JSON.stringify(config, null, 2));
  const validationError = useMemo<string | undefined>(() => {
    try {
      let parsed = JSON.parse(configInput);
      return undefined;
    } catch (err) {
      return err.toString();
    }
  }, [configInput]);

  function handleChange(evt, data: TextareaOnChangeData) {
    setConfigInput(data.value);
    markEdited();
  }

  function handleSave() {
    save(_ => {
      return JSON.parse(configInput);
    });
  }

  function handleReset() {
    setConfigInput(JSON.stringify(config, null, 2));
    markEdited(false);
  }

  return (
    <div className={classes.rawConfigTAContainer}>
      <Field
        label="Raw JSON config"
        hint="Ensure that the config is valid before saving."
        style={{ flexGrow: "1", display: "flex", flexDirection: "column" }}
        validationState={validationError ? "error" : undefined}
        validationMessage={validationError}
      >
        <Textarea
          value={configInput}
          onChange={handleChange}
          style={{ whiteSpace: "pre-wrap", width: "100%", flexGrow: "1" }}
          textarea={{ style: { whiteSpace: "pre-wrap", width: "100%", height: "100%", maxHeight: "unset" } }} />
      </Field>
      <div className={classes.saveRow}>
        <Button
          appearance="primary"
          disabled={saving || !!validationError}
          onClick={handleSave}>
          Save
        </Button>
        <Button
          appearance="secondary"
          onClick={handleReset}>
          Reset
        </Button>
      </div>
    </div>
  );
}

export { Component };
