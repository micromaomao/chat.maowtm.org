import React, { useEffect, useMemo, useState } from "react";
import * as classes from "./dialoguePathSelector.module.css";
import { AdminService, DialogueItemDetails, DialoguePathElement, MetadataDialoguePath } from "app/openapi";
import { Combobox, Option, OptionOnSelectData } from "@fluentui/react-combobox";
import { fetchDialogueItem, fetchRootItems } from "app/utils/dialogueItemData";
import { ErrorCircleRegular, List16Regular, List20Regular } from "@fluentui/react-icons";
import { Text } from "@fluentui/react-components";

interface P {
  initialPath: MetadataDialoguePath;
  initialIsCreate: boolean;
  onChange?: (is_create: boolean, item_or_parent_id: string) => void;
}

interface RowP {
  current_item_or_special: OptionElement;
  has_update_parent_option: boolean;
  depth: number;
  parent_id: string | null;
  onSelect?: (new_item_or_special: OptionElement) => void;
}

enum OptionElementSpecial {
  CREATE_UNDER_PARENT = "_createunderparent",
  UPDATE_PARENT = "_updateparent",
  LOADING = "_loading",
}

type OptionElement = OptionElementSpecial | DialoguePathElement;
function optionToString(opt: OptionElement): string {
  if (typeof opt === "string") {
    return opt;
  }
  return opt.dialogue_id;
}
function Row({ current_item_or_special, has_update_parent_option, depth, parent_id, onSelect }: RowP) {
  const indent = Math.round(Math.pow(depth * 60, 0.8));
  let item: DialoguePathElement = null;
  if (typeof current_item_or_special != "string") {
    item = current_item_or_special;
  }

  const [error, setError] = useState<Error>(null);
  const [siblings, setSiblings] = useState<DialoguePathElement[]>(null);

  const optionToDisplayString = useMemo(() => {
    return (opt: OptionElement): string => {
      if (typeof opt == "string") {
        switch (opt) {
          case OptionElementSpecial.CREATE_UNDER_PARENT:
            if (depth == 0) {
              return "(create new item)";
            }
            return "(create new child)";
          case OptionElementSpecial.UPDATE_PARENT:
            return "(update this item)";
          case OptionElementSpecial.LOADING:
            if (depth == 0) {
              return "(loading items...)"
            }
            return "(loading siblings...)";
          default:
            throw new Error("unreachable");
        }
      } else {
        return opt.canonical_phrasing_text;
      }
    };
  }, [depth])

  useEffect(() => {
    setSiblings(null);
    setError(null);
    let cancelled = false;
    if (parent_id) {
      fetchDialogueItem(parent_id).then(data => {
        if (cancelled) return;
        setSiblings(data.children);
      }, err => {
        if (cancelled) return;
        setError(err);
      });
    } else {
      fetchRootItems().then(data => {
        if (cancelled) return;
        let list: DialoguePathElement[] = [];
        for (let g of data.groups) {
          list.push(...g.items);
        }
        setSiblings(list);
      }, err => {
        if (cancelled) return;
        setError(err);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [parent_id]);

  const [freeformValue, setFreeformValue] = useState<string>(optionToDisplayString(current_item_or_special));
  const [searching, setSearching] = useState<boolean>(false);
  const options = useMemo(() => {
    let arr: OptionElement[] = [OptionElementSpecial.CREATE_UNDER_PARENT];
    if (has_update_parent_option) {
      arr.push(OptionElementSpecial.UPDATE_PARENT);
    }
    if (siblings) {
      arr.push(...siblings.sort((a, b) => a.canonical_phrasing_text.localeCompare(b.canonical_phrasing_text)));
    } else if (item) {
      arr.push(item);
      if (!error) {
        arr.push(OptionElementSpecial.LOADING);
      }
    }
    return arr;
  }, [siblings, item, has_update_parent_option, error]);

  function stringToOption(str: string): OptionElement | null {
    switch (str) {
      case OptionElementSpecial.CREATE_UNDER_PARENT:
      case OptionElementSpecial.UPDATE_PARENT:
        return str;
      case OptionElementSpecial.LOADING:
        return null;
      default:
        if (item && str == item.dialogue_id) {
          return item;
        } else if (siblings) {
          for (let it of siblings) {
            if (it.dialogue_id == str) {
              return it;
            }
          }
        }
        return null;
    }
  }

  function handleOptionSelect(evt: any, data: OptionOnSelectData) {
    let str = data.optionValue;
    if (!str) {
      setSearching(true);
      return;
    }
    let opt = stringToOption(str);
    if (opt === null) {
      return;
    }
    setSearching(false);
    if (onSelect) {
      onSelect(opt);
      setFreeformValue(optionToDisplayString(opt));
    }
  }

  function handleBlur(evt: any) {
    setFreeformValue(optionToDisplayString(current_item_or_special));
    setSearching(false);
  }

  function handleInput(evt: any) {
    let text = evt.target.value;
    setFreeformValue(text);
  }

  return (
    <div className={classes.row} style={{ paddingLeft: `${indent}px` }}>
      <div className={classes.icon}>
        {(item || depth == 0) ? (
          <List16Regular />
        ) : null}
      </div>
      <div>
        <Combobox
          size="medium"
          multiselect={false}
          onOptionSelect={handleOptionSelect}
          onInput={handleInput}
          selectedOptions={[optionToString(current_item_or_special)]}
          value={freeformValue}
          style={{ width: "100%" }}
          freeform={true}
          onBlur={handleBlur}
        >
          {options.map(opt => {
            if (searching) {
              if (typeof opt == "string" && opt != OptionElementSpecial.CREATE_UNDER_PARENT) {
                return null;
              }
            }
            let strid = optionToString(opt);
            let text = optionToDisplayString(opt);
            if (searching && typeof opt != "string" && text.toLowerCase().indexOf(freeformValue.toLowerCase()) == -1) {
              return null;
            }
            return (
              <Option key={strid} value={strid} text={text} disabled={opt === OptionElementSpecial.LOADING}>
                {typeof opt == "string" ? <i>{text}</i> : text}
              </Option>
            );
          })}
        </Combobox>
      </div>
      {error ? (
        <div className={classes.error}>
          <ErrorCircleRegular /> <Text>Unable to get children list: {error.message}</Text>
        </div>
      ) : null}
    </div>
  );
}

export default function DialoguePathSelectorComponent({ initialPath, initialIsCreate, onChange }: P) {
  let [path, setPath] = useState<MetadataDialoguePath>(initialPath);
  let [isCreate, setIsCreate] = useState<boolean>(initialIsCreate);

  useEffect(() => {
    setPath(initialPath);
    setIsCreate(initialIsCreate);
  }, [initialPath, initialIsCreate]);

  if (!path) {
    path = [];
  }

  function handleOnSelect(path_index: number, new_item_or_special: OptionElement) {
    let new_path = path;
    let new_is_create = isCreate;
    if (typeof new_item_or_special == "string") {
      new_path = path.slice(0, path_index);
      setPath(new_path);
      switch (new_item_or_special) {
        case OptionElementSpecial.CREATE_UNDER_PARENT:
          new_is_create = true;
          setIsCreate(new_is_create);
          break;
        case OptionElementSpecial.UPDATE_PARENT:
          new_is_create = false;
          setIsCreate(new_is_create);
          break;
      }
    } else {
      new_path = path.slice(0, path_index + 1);
      new_path[path_index] = new_item_or_special;
      setPath(new_path);
      new_is_create = false;
      setIsCreate(new_is_create);
    }
    if (onChange) {
      let path = new_path;
      onChange(new_is_create, path.length > 0 ? path[path.length - 1].dialogue_id : null);
    }
  }

  return (
    <div className={classes.container}>
      {path.map((item, index) => (
        <Row
          key={index}
          current_item_or_special={item}
          depth={index}
          has_update_parent_option={index > 0}
          onSelect={handleOnSelect.bind(this, index)}
          parent_id={index > 0 ? path[index - 1].dialogue_id : null}
        />
      ))}
      <Row
        key={path.length}
        depth={path.length}
        has_update_parent_option={path.length > 0}
        current_item_or_special={(isCreate || path.length == 0) ? OptionElementSpecial.CREATE_UNDER_PARENT : OptionElementSpecial.UPDATE_PARENT}
        onSelect={handleOnSelect.bind(this, path.length)}
        parent_id={path.length > 0 ? path[path.length - 1].dialogue_id : null}
      />
    </div>
  )
}
