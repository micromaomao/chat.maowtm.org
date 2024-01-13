import type { CSSProperties } from "react";
import { Body2, BrandVariants, Image, Title1, Title2, Title3 } from "@fluentui/react-components";
import { EditRegular } from "@fluentui/react-icons";

const API_BASE = '/api/v1';

// Consider also changing the <title> tag in app/src/index.html
const PROJECT_NAME = "Yet another chatbot";

// If you change the URL here, consider also changing the <meta rel="icon"> tag in index.html.
import iconUrl from "../../assets/icon.svg"
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
    <Image src={iconUrl} style={{ width: "100px", height: "100px" }} fit="contain" />
    <Title1 align="center">{PROJECT_NAME}</Title1>
  </>);
}

// For a list of icons available in Fluent UI, see:
// https://react.fluentui.dev/?path=/docs/concepts-developer-icons-icons-catalog--page

export function HomePageFooter() {
  return (<>
    <div style={{ height: "20px", flexShrink: "1", flexGrow: "0" }} />
    <Title2 align="center">Getting started&hellip;</Title2>
    <div style={css.box}>
      <EditRegular style={css.icon} />
      <Body2 style={css.text}>
        To start building your chatbot, click "Admin Login" below and follow the
        instruction to log in as admin to change the prompt and other settings,
        and start chatting! <br style={{ marginBottom: "10px" }} />

        As you chat with the chatbot, you can provide additional ad-hoc stored
        sample responses by clicking on the <EditRegular style={{
          transform:
            "translateY(2px)"
        }} /> icon next to a message. Try experimenting with different ways of
        phrasing input text and responses to get the best result. Stored
        responses are organized in a tree, and this will influence how the
        sample is matched with the user input. <br style={{ marginBottom: "10px" }} />

        Stored responses, as well as all other settings, are only visible and
        editable by admin.
      </Body2>
    </div>
    <Body2 style={css.text}>
      Most backend settings are changable in the admin interface. However, to
      change this page, you must fork the project and change
      client_config.tsx, then build your own version of the container.
    </Body2>
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

// You can use the Fluent UI Theme Designer to generate a color theme:
// https://react.fluentui.dev/?path=/docs/themedesigner--page
// You just need the BrandVariants bit.

const maochatTheme: BrandVariants = {
  10: "#020402",
  20: "#101C15",
  30: "#162E21",
  40: "#1A3C29",
  50: "#1D4A32",
  60: "#1F583B",
  70: "#226745",
  80: "#24774E",
  90: "#258658",
  100: "#269662",
  110: "#33A66E",
  120: "#57B281",
  130: "#75BF95",
  140: "#90CCA8",
  150: "#ABD8BD",
  160: "#C6E4D1"
};

export { API_BASE, maochatTheme, PROJECT_NAME };
