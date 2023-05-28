"use client"

import { Button, Combobox, Field, Option, Textarea } from "@/app/uicomponents"
import { useSharedState } from "@/app/utils/sharedstate"
import { useState } from "react";

export default function EmbeddingsTest({ available_models }: { available_models: string[] }) {
  const [input1, setInput1] = useSharedState<string>("admin.debug.embeddings.input1", "");
  const [input2, setInput2] = useSharedState<string>("admin.debug.embeddings.input2", "");
  const [model, setModel] = useSharedState<string>("admin.debug.embeddings.model", available_models[0]);
  const handleSelectModel = (_: any, { optionText }: any) => {
    if (optionText) {
      setModel(optionText);
    }
  }
  const [showValidation, setShowValidation] = useState<boolean>(false);
  const input1Valid = input1.length > 0;
  const modelValid = model.length > 0;
  const formValid = input1Valid && modelValid;
  const handleSubmit = () => {
    setShowValidation(true);
    if (!formValid) {
      return;
    }
  }
  return (
    <>
      <Field label="Input 1" required={true}
        validationMessage={(showValidation && !input1Valid) ? "First input must not be empty" : undefined}>
        <Textarea resize="vertical" value={input1} onChange={(_, data) => setInput1(data.value)} />
      </Field>
      <Field label="Input 2" required={false}>
        <Textarea resize="vertical" value={input2} onChange={(_, data) => setInput2(data.value)} />
      </Field>
      <Field label="Model" required={true}
        validationMessage={(showValidation && !modelValid ? "Select or input a model" : undefined)}>
        <Combobox
          freeform={true}
          defaultSelectedOptions={[model]}
          defaultValue={model}
          onOptionSelect={handleSelectModel}
          onInput={evt => setModel((evt.target as HTMLInputElement).value)}>
          {available_models.map(model => (
            <Option value={model} key={model}>
              {model}
            </Option>
          ))}
        </Combobox>
      </Field>
      <div style={{ height: "16px" }}></div>
      <Button appearance="primary" onClick={handleSubmit}>Get embeddings</Button>
    </>
  )
}
