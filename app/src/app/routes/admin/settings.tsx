import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Button, Dialog, DialogActions, DialogBody, DialogContent, DialogOpenChangeData, DialogSurface, DialogTitle, Field, SelectTabData, Skeleton, SkeletonItem, Tab, TabList, Textarea, TextareaOnChangeData, Title2, Toast, ToastBody, ToastTitle, useToastController } from "@fluentui/react-components";

import * as classes from "./settings.module.css";
import { useSharedState } from "app/utils/sharedstate";
import { BracesFilled, TextboxRegular } from "@fluentui/react-icons";
import { OpenAPI } from "app/openapi";
import { Alert } from "@fluentui/react-components/unstable";
import { adminLoadCurrentConfig, adminUpdateConfig } from "app/utils/config";

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
    adminLoadCurrentConfig().then(({ id, config }) => {
      setConfigCtx({ config, configId: id, loading: false, saving: false });
    }, err => {
      setConfigCtx({ error: err, loading: false, saving: false });
    });
  }

  async function handleSave(updateFunction: (config: any) => any) {
    try {
      await adminUpdateConfig(updateFunction, configCtx.config, configCtx.configId);
      toastController.dispatchToast(
        <Toast>
          <ToastTitle>Settings saved</ToastTitle>
        </Toast>,
        { intent: "success" }
      );
      setConfigCtx({ ...configCtx, saving: false });
      handleConfigRefresh();
      return;
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

  function doSelectTab(tab: string) {
    setCurrentTab(tab);
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
          <ConfigTabList
            {...{ currentTab, edited, doSelectTab }}
            tabs={{
              prompt: { icon: <TextboxRegular />, label: "Prompt" },
              rawConfig: { icon: <BracesFilled />, label: "Edit JSON config" },
            }}
          />

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

interface ConfigTabListProps {
  currentTab: string;
  doSelectTab(key: string): void;
  edited: boolean;
  tabs: Record<string, { icon: React.ReactElement, label: string }>;
}

function ConfigTabList({ currentTab, doSelectTab, edited, tabs }: ConfigTabListProps) {
  const [switchTabConfirmDialogTarget, setSwitchTabConfirmDialogTarget] = useState<string | null>(null);

  function handleSelectTab(evt, data: SelectTabData) {
    let tab = data.value as string;
    if (tab == currentTab) {
      return;
    }
    if (!edited) {
      doSelectTab(tab);
    } else {
      setSwitchTabConfirmDialogTarget(tab);
    }
  }

  function handleDialogOpenChange(evt, data: DialogOpenChangeData) {
    if (!data.open) {
      setSwitchTabConfirmDialogTarget(null);
    }
  }

  return (
    <>
      <TabList selectedValue={currentTab} onTabSelect={handleSelectTab}>
        {Object.entries(tabs).map(([key, val]) => (
          <Tab key={key} value={key} icon={val.icon}>{val.label}{edited && currentTab == key ? "*" : ""}</Tab>
        ))}
      </TabList>
      <Dialog open={switchTabConfirmDialogTarget !== null} modalType="modal" onOpenChange={handleDialogOpenChange}>
        <DialogSurface>
          <DialogBody>
            <DialogContent>
              Switching tabs will discard your unsaved changes. Are you sure you want to continue?
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setSwitchTabConfirmDialogTarget(null)}>Cancel</Button>
              <Button appearance="primary" onClick={() => {
                setSwitchTabConfirmDialogTarget(null);
                doSelectTab(switchTabConfirmDialogTarget);
              }}>Discard</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </>
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
    <div>
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
