import type { CSSProperties } from "react";
import { Body2, BrandVariants, Image, Title1, Title2 } from "@fluentui/react-components";
import { EditRegular } from "@fluentui/react-icons";

const API_BASE = '/api/v1';

// Consider also changing the <title> tag in app/src/index.html
const PROJECT_NAME = "Yuki Nagato";

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
    <div style={css.box}>
      Entertainment purpose only. Currently powered by OpenAI.
    </div>
  </>);
}

// You can use the Fluent UI Theme Designer to generate a color theme:
// https://react.fluentui.dev/?path=/docs/themedesigner--page
// You just need the BrandVariants bit.

const maochatTheme: BrandVariants = {
  10: "#0A0006",
  20: "#21131B",
  30: "#321F2B",
  40: "#402A38",
  50: "#4E3645",
  60: "#5C4252",
  70: "#6A4E5F",
  80: "#795B6D",
  90: "#87687B",
  100: "#967689",
  110: "#A58498",
  120: "#B492A6",
  130: "#C3A0B5",
  140: "#D2AFC4",
  150: "#E1BED3",
  160: "#EFCEE2"
};

export { API_BASE, maochatTheme, PROJECT_NAME };
