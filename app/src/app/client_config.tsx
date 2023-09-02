import type { CSSProperties } from "react";
import { Body1, Body2, Image, Title1 } from "@fluentui/react-components";
import { ChatSparkleRegular, PersonCircleRegular, WarningFilled } from "@fluentui/react-icons";

const API_BASE = '/api/v1';

import iconUrl from "../../assets/icon.png"

const css: Record<string, CSSProperties> = {
  box: {
    border: "solid 2px var(--colorNeutralForegroundDisabled)",
    padding: "25px 30px",
    borderRadius: "10px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "space-evenly",
    width: "500px",
    maxWidth: "100%",
    height: "auto",
    gap: "15px"
  },
  icon: {
    width: "38px",
    height: "38px",
    color: "var(--colorNeutralForegroundDisabled)",
    flexShrink: 0,
    flexGrow: 0,
  },
  text: {
    textAlign: "center"
  }
};

export function HomePageHeader() {
  return (<>
    <Image src={iconUrl} style={{ width: "100px", height: "100px" }} fit="contain" />
    <Title1 align="center">Chat with an AI version of me</Title1>
  </>);
}

export function HomePageFooter() {
  return (<>
    <div style={{ height: "20px", flexShrink: "1", flexGrow: "0" }} />
    <div style={css.box}>
      <ChatSparkleRegular style={css.icon} />
      <Body2 style={css.text}>
        You can ask it questions about me personally, and in many cases it is
        capable of generating a good answer.
      </Body2>
    </div>
    <div style={css.box}>
      <WarningFilled style={css.icon} />
      <Body2 style={css.text}>
        Due to how LLM works, generated output may not be true, or may be
        complete nonsense. Please do not take anything seriously.
      </Body2>
    </div>
    <div style={css.box}>
      <PersonCircleRegular style={css.icon} />
      <Body2 style={css.text}>
        Your chat with the AI is completely anonymous, but messages may be
        used later to fine-tune the AI. This allows me to improve it further.
      </Body2>
    </div>
    <Body1>Currently powered by OpenAI.</Body1>
  </>);
}

export { API_BASE };
