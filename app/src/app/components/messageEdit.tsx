import React, { FormEvent, Fragment, useEffect, useMemo, useRef, useState } from "react";
import * as classes from "./messageEdit.module.css";
import { Body1, Body2, Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, DialogTrigger, Field, Input, Skeleton, SkeletonItem, Subtitle1, Subtitle2, Textarea } from "@fluentui/react-components";
import { Add20Filled, ArrowUp20Filled, Delete20Regular, DeleteRegular, DismissRegular, SaveRegular } from "@fluentui/react-icons";
import { AdminService, DialogueItemDetails, InspectLastEditResult, Message, MetadataDialoguePath } from "app/openapi";
import { Alert } from "@fluentui/react-components/unstable";
import { useAutoScrollUpdateSignal } from "./autoScroll";
import DialoguePathSelectorComponent from "./dialoguePathSelector";
import { useSharedState } from "app/utils/sharedstate";
import { fetchDialogueItem } from "app/utils/dialogueItemData";

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
    if (inspectionData.edited) {
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

  const hasValidationErr = replyValidationErr || phrasingValidationErr;

  return (
    <>
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
            style={{ height: "100px" }}
          />
        )}
      </Field>
      <br />
      <Field
        label="Question phrasings"
        hint="These are the phrases that the user might say to trigger this reply."
        size="large"
        validationState={phrasingValidationErr ? "error" : null}
        validationMessage={phrasingValidationErr}
      >
        <PhrasingEditor
          phrasings={phrasings}
          onChange={setPhrasings}
        />
      </Field>

      <br />
      <div className={classes.buttonsRow}>
        <Button
          appearance="primary"
          size="large"
          icon={<SaveRegular />}
          disabled={!!hasValidationErr}>
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
          <DeleteButton item_id={updateId} />
        ) : null}
      </div>
    </>
  );
}

function DeleteButton({ item_id }: { item_id: string }) {
  const [open, setOpen] = useState(false);
  const [itemData, setItemData] = useState<DialogueItemDetails | null>(null);
  const [error, setError] = useState<Error>(null);
  useEffect(() => {
    if (!open) return;
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
  }, [open, item_id])
  return (
    <Dialog modalType="modal" open={open} onOpenChange={(_, data) => setOpen(data.open)}>
      <DialogTrigger>
        <Button
          appearance="transparent"
          size="large"
          icon={<DeleteRegular />}
          style={{ marginLeft: "auto" }}
          className={classes.deleteBtn}
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
                  Are you sure you want to delete the following dialogue item? This will also reset the message edit state.
                </Body2>
                <div style={{ height: "10px" }} />
                <div className={classes.itemDataBox}>
                  <Body1>&gt; {itemData.item_data.phrasings[0]}</Body1>
                  <br />
                  <Body1>&lt; {itemData.item_data.reply}</Body1>
                </div>
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
              <Button appearance="primary" size="medium">Delete</Button>
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
        addBoxRef.current?.focus();
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

interface P {
  message: Message;
  userMessage?: Message;
  onClose: () => void;
}

export default function MessageEditComponent({ message, userMessage, onClose }: P) {
  const [inspectionData, setInspectionData] = useState<InspectLastEditResult>(null)
  const [error, setError] = useState(null);
  const autoScrollUpdate = useAutoScrollUpdateSignal();
  const [reloadKey, setReloadKey] = useState(0);
  const [updateId, setUpdateId] = useState<string | null>(null);
  const [parentId, setParentId] = useState<string | null>(null);

  async function fetchInspectionData() {
    try {
      setInspectionData(await AdminService.getMessagesInspectLastEdit(message.id));
      autoScrollUpdate();
    } catch (e) {
      setError(e);
    }
  }
  useEffect(() => {
    fetchInspectionData();
    autoScrollUpdate();
  }, []);

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

  let pathSelectorComponent = null;
  let initialPath: MetadataDialoguePath = null;
  let initialIsCreate = true;
  if (inspectionData !== null) {
    if (inspectionData.edited) {
      initialPath = inspectionData.updated_dialogue_item.path;
      initialIsCreate = false;
    } else {
      initialPath = inspectionData.prev_reply_path;
    }
    pathSelectorComponent = (
      <DialoguePathSelectorComponent initialPath={initialPath} initialIsCreate={initialIsCreate} onChange={handlePathChange} reset={reloadKey} />
    );
  }
  useEffect(() => {
    if (initialIsCreate) {
      setParentId(initialPath ? initialPath[initialPath.length - 1].dialogue_id : null);
      setUpdateId(null);
    } else {
      setUpdateId(initialPath[initialPath.length - 1].dialogue_id);
      setParentId(null);
    }
  }, [initialPath, initialIsCreate]);

  function handleReload() {
    if (initialPath !== null) {
      handlePathChange(initialIsCreate, initialPath[initialPath.length - 1].dialogue_id);
    } else {
      handlePathChange(true, null);
    }
    setReloadKey(reloadKey + 1);
  }

  let form = null;
  if (inspectionData !== null) {
    form = (
      <MessageEditForm
        onReset={handleReload}
        {...{ updateId, parentId, inspectionData, message, userMessage }}
      />
    );
  }

  return (
    <div className={classes.container}>
      <div className={classes.headingRow}>
        <Subtitle1>Improve this message</Subtitle1>
        <Button icon={<DismissRegular />} appearance="transparent" onClick={onClose} />
      </div>
      {inspectionData === null && error === null ? (
        <Skeleton>
          <SkeletonItem size={32} />
          <div style={{ height: "16px" }} />
          <SkeletonItem size={32} />
        </Skeleton>
      ) : null}
      {error !== null ? (
        <Alert intent="error" action={<Button onClick={fetchInspectionData}>Retry</Button>}>
          {error.message}
        </Alert>
      ) : null}
      <Fragment key={reloadKey}>
        {pathSelectorComponent}
        {form}
      </Fragment>
    </div>
  );
}
