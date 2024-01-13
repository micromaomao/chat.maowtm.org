import type { CSSProperties } from "react";
import { Body1, Body2, BrandVariants, Image, Link, Title1, Title2, Title3 } from "@fluentui/react-components";
import { EditRegular } from "@fluentui/react-icons";

const API_BASE = '/api/v1';

// Consider also changing the <title> tag in app/src/index.html
const PROJECT_NAME = "Yuki Nagato";

// If you change the URL here, consider also changing the <meta rel="icon"> tag in index.html.
import iconUrl from "../../assets/icon.png"
import SugBtn from "./components/initialBannerSuggestionButton";

const css: Record<string, CSSProperties> = {
  box: {
    border: "solid 2px var(--colorNeutralForegroundDisabled)",
    padding: "25px 30px",
    borderRadius: "10px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "space-evenly",
    width: "700px",
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
    maxWidth: "700px",
    marginTop: "0",
    marginBottom: "0",
    textAlign: "center"
  },
  suggestionGrid: {
    display: "flex",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: "10px",
    width: "100%",
    maxWidth: "1000px",
    margin: "10px auto",
  }
};

export function HomePageHeader() {
  return (<>
    <Image src={iconUrl} style={{ width: "100px", height: "100px", borderRadius: "50%" }} fit="contain" />
    <Title1 align="center">{PROJECT_NAME}</Title1>
  </>);
}

// For a list of icons available in Fluent UI, see:
// https://react.fluentui.dev/?path=/docs/concepts-developer-icons-icons-catalog--page

export function HomePageFooter() {
  return (<>
    <div style={{ height: "20px", flexShrink: "1", flexGrow: "0" }} />
    <Body2 style={css.text}>
      Created by <Link href="https://maowtm.org" rel="me"
      target="_blank">maowtm</Link> based on <Link
      href="https://chat.maowtm.org" target="_blank">MaoChat</Link>. <Link
      href="https://github.com/micromaomao/chat.maowtm.org">Source code on
      GitHub</Link>
    </Body2>
    <Body1 style={css.text}>
      Messages are anonymous, but may be used for improving the bot. <br />
      Currently powered by OpenAI.
    </Body1>

    <Body2 style={css.text}>Yuki best girl!</Body2>
  </>);
}

export function ChatInitialBannerContent() {
  return (<>
    <Title3 style={{ fontWeight: "normal" }}>Need ideas?</Title3>
    <div style={css.suggestionGrid}>
      <SugBtn>What is your favourite programming language?</SugBtn>
      <SugBtn>Do you watch anime?</SugBtn>
      <SugBtn>Can you help me write some code?</SugBtn>
      <SugBtn>Do you like reading books?</SugBtn>
      <SugBtn>What knowledge do you have?</SugBtn>
      <SugBtn>[Add more questions here!]</SugBtn>
    </div>
  </>);
}

// #be7ca1

// You can use the Fluent UI Theme Designer to generate a color theme:
// https://react.fluentui.dev/?path=/docs/themedesigner--page
// You just need the BrandVariants bit.

const maochatTheme: BrandVariants = {
  10: "#050203",
  20: "#1F131A",
  30: "#351E2B",
  40: "#462739",
  50: "#7c4565",
  60: "#904f75",
  70: "#a7698d",
  80: "#b16f96",
  90: "#b47c9e",
  100: "#967689",
  110: "#A58498",
  120: "#B492A6",
  130: "#C3A0B5",
  140: "#D2AFC4",
  150: "#E1BED3",
  160: "#EFCEE2"
};

export { API_BASE, maochatTheme, PROJECT_NAME };
