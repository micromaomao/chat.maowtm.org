"use client"

import { Alert, Button, Combobox, Field, Option, Skeleton, SkeletonItem, Textarea, Body2, ProgressBar, DeleteRegular, AddCircleRegular } from "@/app/uicomponents"
import { useSharedState } from "@/app/utils/sharedstate"
import { Link } from "@/app/uicomponents";
import { PureComponent, RefObject, createContext, createRef, useContext, useEffect, useState } from "react";
import useSWRImmutable from "swr/immutable"

import styles from "./embeddings.module.css"

const setBestMatchHighlightContext = createContext<any>(null);

export default function EmbeddingsTest({ available_models }: { available_models: string[] }) {
  const [inputs, setInputs] = useSharedState<string[]>("admin.debug.embeddings.inputs", [""]);
  const [model, setModel] = useSharedState<string>("admin.debug.embeddings.model", available_models[0]);
  const handleSelectModel = (_: any, { optionText }: any) => {
    if (optionText) {
      setModel(optionText);
      setBestMatchHighlight(null);
    }
  }
  const handleInputModel = (evt: any) => {
    setModel((evt.target as HTMLInputElement).value);
    setBestMatchHighlight(null);
  }
  const [showValidation, setShowValidation] = useState<boolean>(false);
  const inputsValid = inputs.map(ipt => ipt.length > 0);
  const modelValid = model.length > 0;
  const formValid = inputsValid.every(x => x) && inputs.length > 0 && modelValid;
  const [currentResultInput, setCurrentResultInput] = useState<any>(null);
  const [bestMatchHighlight, setBestMatchHighlight] = useState<number | null>(null);
  const handleSubmit = () => {
    setShowValidation(true);
    if (!formValid) {
      return;
    }
    setCurrentResultInput({ inputs, model })
  }
  const updateInput = (idx: number, value: string) => {
    let newInputs = [...inputs];
    newInputs[idx] = value;
    setInputs(newInputs);
    setBestMatchHighlight(null);
  }
  const addInput = () => {
    setInputs([...inputs, ""]);
    setShowValidation(false);
    setBestMatchHighlight(null);
  }
  const removeInput = (idx: number) => {
    setInputs(inputs.filter((_, i) => i !== idx));
    setBestMatchHighlight(null);
  }
  return (
    <>
      {inputs.map((input, idx) => (
        <Field key={idx}
          className={styles.inputField + (idx === bestMatchHighlight ? (" " + styles.bestMatch) : "")}
          label={`Input ${idx + 1}`}
          required={true}
          validationMessage={(showValidation && !inputsValid[idx]) ? `Input ${idx + 1} must not be empty` : undefined}
        >
          <div className={styles.inputRow + (idx === 0 ? (" " + styles.inputRowNoRemove) : "")} key={idx}>
            <Textarea
              resize="vertical"
              defaultValue={input}
              onChange={(_, data) => updateInput(idx, data.value)}
              appearance={idx === bestMatchHighlight ? "filled-lighter" : undefined}
            />
            {idx > 0 ? (
              <Button className={styles.removeInputBtn} appearance="transparent" onClick={() => removeInput(idx)} icon={<DeleteRegular />} />
            ) : null}
          </div>
        </Field>
      ))}
      <div style={{ height: "8px" }} />
      {inputs.length < 30 ? (
        <Button appearance="secondary" onClick={addInput} icon={<AddCircleRegular />}>
          Add input
        </Button>) : null}
      <div style={{ height: "16px" }} />
      <Field label="Model" required={true}
        validationMessage={(showValidation && !modelValid ? "Select or input a model" : undefined)}>
        <Combobox
          freeform={true}
          defaultSelectedOptions={[model]}
          defaultValue={model}
          onOptionSelect={handleSelectModel}
          onInput={handleInputModel}>
          {available_models.map(model => (
            <Option value={model} key={model}>
              {model}
            </Option>
          ))}
        </Combobox>
      </Field>
      <div style={{ height: "16px" }}></div>
      <Button appearance="primary" onClick={handleSubmit}>Get embeddings</Button>
      {currentResultInput ? (
        <>
          <div style={{ height: "16px" }}></div>
          <setBestMatchHighlightContext.Provider value={setBestMatchHighlight}>
            <EmbeddingsResult {...currentResultInput} />
          </setBestMatchHighlightContext.Provider>
        </>
      ) : null}
    </>
  )
}

class ResponseError extends Error {
  constructor(message: string) {
    super(message);
  }
  override toString(): string {
    return this.message
  }
}

const fetcher = (key: string) => fetch(key, { headers: { "Accept": "application/json" } }).then(async res => {
  if (!res.ok) {
    if (res.headers.get("content-type")?.startsWith("text/plain")) {
      let text = await res.text();
      throw new ResponseError(text);
    } else {
      throw new ResponseError(`${res.status} ${res.statusText}`);
    }
  }
  return await res.json()
})

function EmbeddingsResult({ inputs, model }: {
  inputs: string[],
  model: string
}) {
  let key = `/admin/debug/embedding/get?model=${encodeURIComponent(model)}`;
  for (let input of inputs) {
    key += `&input=${encodeURIComponent(input)}`;
  }
  let { data, error, isLoading, mutate } = useSWRImmutable(key, fetcher, { shouldRetryOnError: false, keepPreviousData: true });
  if (typeof data !== "object") {
    data = null;
  }
  if (!data && !error && isLoading) {
    return (
      <Skeleton appearance="opaque">
        <SkeletonItem />
        <SkeletonItem />
      </Skeleton>
    )
  }
  return (
    <>
      {isLoading ? (
        <ProgressBar as="div" value={undefined} thickness="medium" />
      ) : null}
      {error ? (
        <Alert intent="error" action={isLoading ? undefined : (<Link onClick={evt => mutate(key)}>Retry</Link>)}>
          {error.toString()}
        </Alert>
      ) : null}
      {data ? (
        <EmbeddingsResultMaps data={data} />
      ) : null}
    </>
  )
}

function EmbeddingsResultMaps({ data }: { data: any }) {
  let bestMatchI: number | null = null;
  let bestMatchScore = 0;
  for (let i = 1; i < data.similarities.length; i++) {
    if (bestMatchI === null || data.similarities[i] > bestMatchScore) {
      bestMatchI = i;
      bestMatchScore = data.similarities[i];
    }
  }
  let setBestMatchHighlight = useContext(setBestMatchHighlightContext);
  useEffect(() => {
    if (setBestMatchHighlight) {
      setBestMatchHighlight(bestMatchI);
    }
  }, [data])
  return (
    <div className={styles.embeddingsMapContainer}>
      {data.embeddings.map((embedding: number[], idx: number) => (
        <div key={idx} className={bestMatchI === idx ? styles.bestMatch : ""}>
          <Body2 block={true}>Input {idx + 1}:</Body2>
          <EmbeddingsBar embeddings={embedding} />
          {idx > 0 ? (
            <Field validationMessage={`Cosine similarity with input 1: ${data.similarities[idx]}`} validationState="none" className={styles.similarityRow}>
              <ProgressBar as="div" value={Math.max(0, data.similarities[idx])} max={1} shape="rounded" thickness="large" />
            </Field>
          ) : null}
        </div>
      ))}
    </div>
  )
}

interface EmbeddingsBarProps {
  embeddings: number[]
}

class EmbeddingsBar extends PureComponent<EmbeddingsBarProps> {
  canvasRef: RefObject<HTMLCanvasElement>;

  constructor(props: EmbeddingsBarProps) {
    super(props);
    this.canvasRef = createRef();
    this.redraw = this.redraw.bind(this);
  }

  componentDidMount() {
    this.redraw();
    window.addEventListener("resize", this.redraw);
  }

  componentWillUnmount() {
    window.removeEventListener("resize", this.redraw);
  }

  componentDidUpdate(prevProps: Readonly<EmbeddingsBarProps>, prevState: any): void {
    if (prevProps.embeddings !== this.props.embeddings) {
      this.redraw();
    }
  }

  render() {
    return (<canvas ref={this.canvasRef} className={styles.embeddingsBar} />)
  }

  redraw() {
    if (!this.canvasRef.current) {
      return;
    }

    let { embeddings } = this.props;
    let canvas = this.canvasRef.current as HTMLCanvasElement;
    let dpr = window.devicePixelRatio;

    let blockCssSize = 6;
    if (embeddings.length >= 4000) {
      blockCssSize = 2;
    }
    let blockPixelSize = Math.round(blockCssSize * dpr);
    let nbBlocks = this.props.embeddings.length;
    let blocksPerRow = Math.floor(Math.sqrt(nbBlocks));
    canvas.width = blocksPerRow * blockPixelSize;
    canvas.style.width = `${blocksPerRow * blockCssSize}px`;
    let nbRows = Math.ceil(nbBlocks / blocksPerRow);
    canvas.height = nbRows * blockPixelSize;
    canvas.style.height = `${nbRows * blockCssSize}px`;

    let ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < embeddings.length; i += 1) {
      let row = Math.floor(i / blocksPerRow);
      let col = i % blocksPerRow;
      let p = embeddings[i];
      let POW_FACTOR = 0.3;
      p = Math.sign(p) * Math.pow(Math.abs(p), POW_FACTOR);
      let color;
      if (p < 0) {
        p = -p;
        color = `rgb(255, ${(1 - p) * 255}, ${(1 - p) * 255})`
      } else {
        color = `rgb(${(1 - p) * 255}, 255, ${(1 - p) * 255})`
      }
      ctx.fillStyle = color;
      ctx.strokeStyle = 'none';
      ctx.fillRect(col * blockPixelSize, row * blockPixelSize, blockPixelSize, blockPixelSize);
    }
  }
}
