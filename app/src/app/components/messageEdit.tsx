import React, { FormEvent, Fragment, forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import * as classes from "./messageEdit.module.css";
import { Body1, Body2, Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, DialogTrigger, Field, Input, Radio, RadioGroup, RadioGroupOnChangeData, Skeleton, SkeletonItem, Spinner, Subtitle1, Subtitle2, Textarea } from "@fluentui/react-components";
import { Add20Filled, ArrowUp20Filled, Delete20Regular, DeleteRegular, DismissRegular, ErrorCircle20Regular, ErrorCircle24Regular, SaveRegular } from "@fluentui/react-icons";
import { AdminService, ApiError, DialogueItemDetails, EditChatRequest, InspectLastEditResult, Message, MetadataDialoguePath } from "app/openapi";
import { Alert } from "@fluentui/react-components/unstable";
import { useAutoScrollUpdateSignal } from "./autoScroll";
import DialoguePathSelectorComponent from "./dialoguePathSelector";
import { useSharedState } from "app/utils/sharedstate";
import { fetchDialogueItem, mutateDialogues } from "app/utils/dialogueItemData";
import { useChatController } from "./contexts";
import type * as PathSelector from "./dialoguePathSelector";

interface FormP {
  updateId?: string | null;
  parentId?: string | null;
  message: Message;
  userMessage?: Message;
  inspectionData: InspectLastEditResult;
  onReset: () => void;
}

interface Data {
  phrasings: string[];
  reply: string;
}

function MessageEditForm({ updateId, parentId, message, userMessage, inspectionData, onReset }: FormP) {
  const message_id = message.id;
  const [phrasings, setPhrasings] = useSharedState<string[]>(`MessageEditForm.${message_id}.phrasings`, []);
  const [reply, setReply] = useSharedState<string>(`MessageEditForm.${message_id}.reply`, "");
  const [fetchError, setFetchError] = useState<Error>(null);
  const [initialLoad, setInitialLoad] = useState(true);
  function clearErrorAndInitialLoad() {
    setFetchError(null);
    setInitialLoad(false);
  }
  useEffect(() => {
    if (inspectionData?.edited) {
      let item = inspectionData.updated_dialogue_item!;
      if (updateId === item.path[item.path.length - 1].dialogue_id) {
        setPhrasings(inspectionData.updated_dialogue_item.phrasings);
        setReply(inspectionData.updated_dialogue_item.reply);
        clearErrorAndInitialLoad();
        return;
      }
    }
    if (updateId === null) {
      // Creating a new item - pre-populate with message given
      setPhrasings([userMessage.content]);
      setReply(message.content);
      clearErrorAndInitialLoad();
    } else {
      let cancelled = false;
      setInitialLoad(true);
      fetchDialogueItem(updateId).then(item => {
        if (cancelled) return;
        clearErrorAndInitialLoad();
        setPhrasings(item.item_data.phrasings);
        setReply(item.item_data.reply);
      }, err => {
        if (cancelled) return;
        setInitialLoad(false);
        setFetchError(err);
      });
      return () => { cancelled = true };
    }
  }, [updateId, parentId, message.content, userMessage?.content, inspectionData]);

  function handleReplyInput(e: FormEvent<HTMLTextAreaElement>) {
    let newValue = e.currentTarget.value;
    setReply(newValue);
  }

  const replyValidationErr = useMemo(() => {
    if (reply.trim() == "") {
      return "Reply text is required";
    }
    return null;
  }, [reply]);

  const phrasingValidationErr = useMemo(() => {
    if (phrasings.length == 0 || phrasings[0].trim() == "") {
      return "At least one phrasing is required";
    }
    return null;
  }, [phrasings]);

  const hasValidationErr = !!replyValidationErr || !!phrasingValidationErr;

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<Error>(null);

  const autoScrollUpdate = useAutoScrollUpdateSignal();
  const chatController = useChatController();

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      let req: EditChatRequest = {
        phrasings, reply,
      };
      if (updateId) {
        req.item_id = updateId;
      } else {
        req.parent_id = parentId;
      }
      await AdminService.putMessagesEditBot(message.id, req);
      setSubmitting(false);
      chatController.handleMarkMessageEdited(message.id);
      mutateDialogues();
      onReset();
    } catch (e) {
      if (e instanceof ApiError) {
        e = new Error(e.body);
      }
      setSubmitting(false);
      setSubmitError(e);
    } finally {
      autoScrollUpdate();
    }
  }

  async function handleDelete(recursive: boolean) {
    if (!updateId) return;
    setInitialLoad(true);
    AdminService.deleteDialogueItem(updateId, recursive).then(() => {
      mutateDialogues();
      onReset();
    }, err => {
      if (err instanceof ApiError) {
        err = new Error(err.body);
      }
      setInitialLoad(false);
      setSubmitError(err);
    });
  }

  return (
    <>
      <Field
        label="Question phrasings"
        hint="These are the phrases that the user might say to trigger this reply."
        size="large"
        validationState={phrasingValidationErr ? "error" : null}
        validationMessage={phrasingValidationErr}
      >
        {initialLoad ? (
          <Skeleton>
            <SkeletonItem />
          </Skeleton>
        ) : (
          <PhrasingEditor
            phrasings={phrasings}
            onChange={setPhrasings}
          />
        )}
      </Field>
      <br />
      <Field
        label="Reply text"
        size="large"
        validationState={replyValidationErr ? "error" : null}
        validationMessage={replyValidationErr}
      >
        {initialLoad ? (
          <Skeleton>
            <SkeletonItem />
          </Skeleton>
        ) : (
          <Textarea
            value={reply}
            onInput={handleReplyInput}
            size="large"
            style={{ height: "150px" }}
          />
        )}
      </Field>

      <br />
      {!initialLoad ? (
        <div className={classes.buttonsRow}>
          <Button
            appearance="primary"
            size="large"
            icon={!submitting ? <SaveRegular /> : <Spinner size="tiny" />}
            disabled={hasValidationErr || submitting}
            onClick={handleSubmit}
          >
            Save
          </Button>
          <Button
            appearance="subtle"
            size="large"
            onClick={onReset}
          >
            Reset
          </Button>
          {updateId ? (
            <DeleteButton
              item_id={updateId}
              disabled={submitting}
              onConfirm={handleDelete}
            />
          ) : null}
        </div>
      ) : null}

      {submitError ? (
        <div className={classes.error}>
          <ErrorCircle20Regular style={{ marginRight: "10px" }} /> {submitError.message}
        </div>
      ) : null}
    </>
  );
}

function DeleteButton({ item_id, onConfirm, disabled }: { item_id: string, onConfirm: (recursive: boolean) => void, disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [itemData, setItemData] = useState<DialogueItemDetails | null>(null);
  const [recursive, setRecursive] = useState(false);
  const [error, setError] = useState<Error>(null);

  useEffect(() => {
    if (!open) return;
    setItemData(null);
    setRecursive(false);
    let cancelled = false;
    fetchDialogueItem(item_id).then(item => {
      if (cancelled) return;
      setItemData(item);
      setError(null);
    }, err => {
      if (cancelled) return;
      setError(err);
    });
    return () => { cancelled = true };
  }, [open, item_id]);

  function handleRadioChange(e, data: RadioGroupOnChangeData) {
    setRecursive(data.value == "recursive");
  }

  function handleConfirm() {
    setOpen(false);
    onConfirm(recursive);
  }

  return (
    <Dialog modalType="modal" open={open} onOpenChange={(_, data) => (!disabled ? setOpen(data.open) : undefined)}>
      <DialogTrigger>
        <Button
          appearance="transparent"
          size="large"
          icon={<DeleteRegular />}
          style={{ marginLeft: "auto" }}
          className={classes.deleteBtn}
          disabled={disabled}
        >
          Delete this item
        </Button>
      </DialogTrigger>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>Delete dialogue item?</DialogTitle>
          <DialogContent>
            {itemData === null ? (
              error === null ? (
                <Skeleton>
                  <SkeletonItem />
                </Skeleton>
              ) : (
                <>
                  Error getting item data: {error.message}
                </>
              )
            ) : (
              <>
                <Body2>
                  Are you sure you want to delete the following dialogue item?
                </Body2>
                <div style={{ height: "10px" }} />
                <div className={classes.itemDataBox}>
                  <Body1>&gt; {itemData.item_data.phrasings[0]}</Body1>
                  <br />
                  <Body1>&lt; {itemData.item_data.reply}</Body1>
                </div>
                {itemData.children.length > 0 ? (() => {
                  let nb_children = itemData.children.length;
                  let set_parent_label = `Move ${nb_children} direct children to be under the parent of this item`;
                  if (itemData.item_data.path.length == 1) {
                    set_parent_label = `Turn ${nb_children} direct children into root items`;
                  }
                  return <>
                    <div style={{ height: "10px" }} />
                    <Body2>
                      This dialogue item has {nb_children} children&hellip;
                    </Body2>
                    <RadioGroup value={recursive ? "recursive" : "set_parent"} onChange={handleRadioChange}>
                      <Radio value="recursive" label="Delete all children recursively as well" />
                      <Radio value="set_parent" label={set_parent_label} />
                    </RadioGroup>
                  </>
                })() : null}
              </>
            )}
          </DialogContent>
        </DialogBody>
        <div style={{ height: "10px" }} />
        <DialogActions position="end" style={{ justifyContent: "end" }}>
          {itemData === null ? (
            <DialogTrigger>
              <Button appearance="secondary" size="medium">Cancel</Button>
            </DialogTrigger>
          ) : (
            <>
              <DialogTrigger>
                <Button appearance="secondary" size="medium">Cancel</Button>
              </DialogTrigger>
              <Button appearance="primary" size="medium" onClick={handleConfirm}>Delete</Button>
            </>
          )}
        </DialogActions>
      </DialogSurface>
    </Dialog>
  )
}

interface PhrasingEditorP {
  phrasings: string[];
  onChange: (phrasings: string[]) => void;
}

function normalize(phrasings: string[]): string[] {
  let dedup = [];
  for (let ph of phrasings) {
    ph = ph.trim();
    if (ph == "") {
      continue;
    }
    if (!dedup.includes(ph)) {
      dedup.push(ph);
    }
  }
  if (dedup.length == 0) {
    dedup.push("");
  }
  return dedup;
}

function PhrasingEditor({ phrasings, onChange }: PhrasingEditorP) {
  const addBoxRef = useRef<HTMLInputElement>(null);

  function handleChange(i: number, e: FormEvent<HTMLInputElement>) {
    let changedValue = e.currentTarget.value;
    let new_phrasings = [...phrasings];
    if (i < new_phrasings.length) {
      new_phrasings[i] = changedValue;
    } else {
      if (changedValue.trim() == "") return;
      new_phrasings.push(changedValue);
      new_phrasings = normalize(new_phrasings);
    }
    if (addBoxRef.current && e.currentTarget !== addBoxRef.current && addBoxRef.current.value.trim() != "") {
      let t = addBoxRef.current.value.trim();
      if (!new_phrasings.includes(t)) {
        new_phrasings.push(t);
        addBoxRef.current.value = "";
      }
    }
    onChange(new_phrasings);
  }
  function handleBlur(i: number, e: FormEvent<HTMLInputElement>) {
    let value = e.currentTarget.value;
    let new_phrasings = phrasings.slice();
    if (value == "" && new_phrasings.length > 1) {
      new_phrasings.splice(i, 1);
    } else {
      new_phrasings[i] = value;
    }
    onChange(normalize(new_phrasings));
  }
  function handlePromote(i: number) {
    let new_phrasings = [...phrasings];
    let phrasing = new_phrasings.splice(i, 1)[0];
    new_phrasings.unshift(phrasing);
    onChange(new_phrasings);
  }
  function handleDelete(i: number) {
    let new_phrasings = [...phrasings];
    new_phrasings.splice(i, 1);
    onChange(new_phrasings);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key == "Enter") {
      e.preventDefault();
      if (addBoxRef.current) {
        addBoxRef.current.focus();
      }
    }
  }
  function handleAddBoxKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (addBoxRef.current && e.key == "Enter") {
      e.preventDefault();
      addBoxRef.current.blur();
      setTimeout(() => {
        addBoxRef.current?.focus?.();
      }, 1);
    }
  }

  return (
    <div className={classes.phrasings}>
      {phrasings.map((phrasing, i) => {
        let is_canonical = i == 0;
        return (
          <div key={i} className={classes.phrasingRow}>
            {!is_canonical ? (
              <div className={classes.phrasingBtns}>
                <Button
                  icon={<ArrowUp20Filled />}
                  size="small"
                  appearance="transparent"
                  title="Promote to primary"
                  onClick={handlePromote.bind(this, i)}
                />
                <Button
                  icon={<Delete20Regular />}
                  size="small"
                  appearance="transparent"
                  title="Delete this phrasing"
                  onClick={handleDelete.bind(this, i)}
                />
              </div>
            ) : null}
            <Input
              value={phrasing}
              onChange={handleChange.bind(this, i)}
              onBlur={handleBlur.bind(this, i)}
              size="large"
              className={classes.phrasingInput}
              onKeyDown={handleKeyDown}
              placeholder={is_canonical ? "(Enter the primary phrasing)" : undefined}
            />
          </div>
        );
      })}
      {phrasings.length > 0 && phrasings[0].trim() != "" ? (
        <div key={phrasings.length} className={classes.phrasingRow}>
          <div className={classes.phrasingBtns}>
            <Add20Filled />
          </div>
          <Input
            defaultValue=""
            placeholder="(Add new phrasing)"
            onBlur={handleChange.bind(this, phrasings.length)}
            size="large"
            className={classes.phrasingInput}
            ref={addBoxRef}
            onKeyDown={handleAddBoxKeyDown}
          />
        </div>
      ) : null}
    </div>
  )
}

export interface P {
  defaultUpdateId?: string | null;
  message: Message;
  userMessage?: Message;
  onClose: () => void;
}

export interface R {
  reset: () => void;
}

const MessageEditComponent = forwardRef<R, P>(function MessageEditComponent({ defaultUpdateId, message, userMessage, onClose }, ref) {
  const [error, setError] = useState(null);
  const autoScrollUpdate = useAutoScrollUpdateSignal();

  const [initialReady, setInitialReady] = useState<boolean>(false);
  const [inspectionData, setInspectionData] = useState<InspectLastEditResult>(null)
  const [initialPath, setInitialPath] = useState<MetadataDialoguePath>(null);
  const [initialIsCreate, setInitialIsCreate] = useState<boolean>(true);

  const [updateId, setUpdateId] = useState<string | null>(null);
  const [parentId, setParentId] = useState<string | null>(null);

  const pathSelectorRef = useRef<PathSelector.R>();

  async function fetchInspectionData(signal: AbortSignal) {
    try {
      setInitialReady(false);
      let inspectionData = await AdminService.getMessagesInspectLastEdit(message.id);
      if (signal.aborted) return;
      setInspectionData(inspectionData);
      if (inspectionData.edited) {
        let initialPath = inspectionData.updated_dialogue_item.path;
        setInitialPath(initialPath);
        setInitialIsCreate(false);
        setUpdateId(initialPath[initialPath.length - 1].dialogue_id);
        setParentId(null);
      } else {
        let initialPath = inspectionData.prev_reply_path;
        setInitialPath(initialPath);
        setInitialIsCreate(true);
        setParentId(initialPath ? initialPath[initialPath.length - 1].dialogue_id : null);
        setUpdateId(null);
      }
      setInitialReady(true);
      setError(null);
      // setTimeout to wait for new prop to be set by React
      setTimeout(() => {
        pathSelectorRef.current?.reset?.();
        autoScrollUpdate();
      });
    } catch (e) {
      if (signal.aborted) return;
      if (e instanceof ApiError) {
        e = new Error(e.body);
      }
      setError(e);
    }
  }

  function handleReset(igore_default_update_id?: boolean) {
    let controller = new AbortController();
    setInitialReady(false);
    setInspectionData(null);
    setUpdateId(null);
    setParentId(null);
    if (!defaultUpdateId || igore_default_update_id) {
      fetchInspectionData(controller.signal);
    } else {
      fetchDialogueItem(defaultUpdateId).then(item => {
        if (controller.signal.aborted) return;
        setInitialIsCreate(false);
        let initialPath = item.item_data.path;
        setInitialPath(initialPath);
        setParentId(null);
        setUpdateId(defaultUpdateId);
        setInitialReady(true);
        setError(null);
        // setTimeout to wait for new prop to be set by React
        setTimeout(() => {
          pathSelectorRef.current?.reset?.();
        });
      }, err => {
        if (controller.signal.aborted) return;
        setError(err);
      });
    }
    autoScrollUpdate();
    return () => controller.abort();
  }

  useEffect(handleReset, [message.id, defaultUpdateId]);

  function handlePathChange(is_create: boolean, item_or_parent_id: string) {
    if (is_create) {
      setUpdateId(null);
      setParentId(item_or_parent_id);
    } else {
      setParentId(null);
      setUpdateId(item_or_parent_id);
    }
    autoScrollUpdate();
  }

  useImperativeHandle(ref, () => {
    return {
      reset: handleReset,
    };
  }, [handleReset])

  return (
    <div className={classes.container}>
      <div className={classes.headingRow}>
        <Subtitle1>Improve this message</Subtitle1>
        <Button icon={<DismissRegular />} appearance="transparent" onClick={onClose} />
      </div>
      {!initialReady && error === null ? (
        <Skeleton>
          <SkeletonItem size={32} />
          <div style={{ height: "16px" }} />
          <SkeletonItem size={32} />
        </Skeleton>
      ) : null}
      {error !== null ? (
        <Alert intent="error" action={<Button onClick={handleReset.bind(undefined, false)}>Retry</Button>}>
          {error.message}
        </Alert>
      ) : null}
      <Fragment>
        {initialReady ? (
          <>
            <DialoguePathSelectorComponent initialPath={initialPath} initialIsCreate={initialIsCreate} onChange={handlePathChange} ref={pathSelectorRef} />
            <MessageEditForm
              onReset={handleReset.bind(undefined, true)}
              {...{ updateId, parentId, inspectionData, message, userMessage }}
            />
          </>
        ) : null}
      </Fragment>
    </div>
  );
});

export default MessageEditComponent;
