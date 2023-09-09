import type { CSSProperties } from "react";
import { Body1, Body2, BrandVariants, Image, Link, Title1 } from "@fluentui/react-components";
import { ChatSparkleRegular, PersonCircleRegular, WarningFilled } from "@fluentui/react-icons";

const API_BASE = '/api/v1';

// Consider also changing the <title> tag in app/src/index.html
const PROJECT_NAME = "MaoChat";

// If you change the URL here, consider also changing the <meta rel="icon"> tag in index.html.
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
    textAlign: "center",
    maxWidth: "550px",
  }
};

export function HomePageHeader() {
  return (<>
    <Image src={iconUrl} style={{ width: "100px", height: "100px" }} fit="contain" />
    <Title1 align="center">Chat with an AI version of me</Title1>
  </>);
}

// For a list of icons available in Fluent UI, see:
// https://react.fluentui.dev/?path=/docs/concepts-developer-icons-icons-catalog--page

export function HomePageFooter() {
  return (<>
    <div style={{ height: "20px", flexShrink: "1", flexGrow: "0" }} />
    <div style={css.box}>
      <ChatSparkleRegular style={css.icon} />
      <Body2 style={css.text}>
        You can ask it personal questions about me, and in many cases it is
        capable of generating a good answer.
      </Body2>
    </div>
    <div style={css.box}>
      <WarningFilled style={css.icon} />
      <Body2 style={css.text}>
        <b>Due to how LLM works, generated output <i>and</i> suggestions may not be true, or may be
          complete nonsense. Please do not take anything it says seriously.</b> This is just a proof of concept.
      </Body2>
    </div>
    <div style={css.box}>
      <PersonCircleRegular style={css.icon} />
      <Body2 style={css.text}>
        Your chat with the AI is completely anonymous, but messages may be
        used later to fine-tune the AI. This allows me to improve it further.
      </Body2>
    </div>
    <Body2 style={css.text}>
      Currently powered by OpenAI. Source code <Link href="https://github.com/micromaomao/chat.maowtm.org" target="_blank">
        available on GitHub
      </Link>, and at some point in the near future I will probably write a blog article about how this was built&hellip;
    </Body2>
    <Body1 style={css.text}>
      Also check out the <Link href="https://yuki.maowtm.org" target="_blank">Yuki bot</Link>!
    </Body1>
  </>);
}

// You can use the Fluent UI Theme Designer to generate a color theme:
// https://react.fluentui.dev/?path=/docs/themedesigner--page
// You just need the BrandVariants bit.

const maochatTheme: BrandVariants = {
  10: "#050109",
  20: "#1E0F34",
  30: "#33125D",
  40: "#46127D",
  50: "#5B0D9B",
  60: "#7203B7",
  70: "#8A00CD",
  80: "#A200E1",
  90: "#BA00F5",
  100: "#CF21FF",
  110: "#DE44FF",
  120: "#EB5FFF",
  130: "#F678FF",
  140: "#FE90FF",
  150: "#FFABFB",
  160: "#FFC4F8"
};

export { API_BASE, maochatTheme, PROJECT_NAME };
