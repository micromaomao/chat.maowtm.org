"use client"

import { Button, Field, Textarea } from "@/app/uicomponents"
import { useSharedState } from "@/app/utils/sharedstate"

export default function EmbeddingsTest() {
  const [input1, setInput1] = useSharedState<string>("admin.debug.embeddings.input1", "");
  const [input2, setInput2] = useSharedState<string>("admin.debug.embeddings.input2", "");
  return (
    <>
      <Field label="Input 1" required={true}>
        <Textarea resize="vertical" value={input1} onChange={(_, data) => setInput1(data.value)} />
      </Field>
      <Field label="Input 2" required={false}>
        <Textarea resize="vertical" value={input2} onChange={(_, data) => setInput2(data.value)} />
      </Field>
      <div style={{ height: "16px" }}></div>
      <Button appearance="primary">Get embeddings</Button>
    </>
  )
}
