import { useMemo, type CSSProperties } from "react";
import { Body2, BrandVariants, Image, Link, Title1, Title2, Title3 } from "@fluentui/react-components";
import { PersonCircleRegular, WarningFilled } from "@fluentui/react-icons";
import { useWindowSize } from "./utils/windowHooks";

const API_BASE = '/api/v1';

// Consider also changing the <title> tag in app/src/index.html
const PROJECT_NAME = "可以向我提出任何问题哦😆";

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
    textAlign: "center",
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
    <div style={css.box}>
      <PersonCircleRegular style={css.icon} />
      <Body2 style={css.text}>
        你与AI的聊天是完全匿名的，但消息可能会被用来进一步微调AI，以此进一步改进它。<br />
        Your chat with the AI is completely anonymous, but messages may be used later to fine-tune the AI. This allows me to improve it further.
      </Body2>
    </div>
    <div style={css.box}>
      <WarningFilled style={css.icon} />
      <Body2 style={css.text}>
        此AI表达的任何观点都不代表我的真实观点，请不要把它说的任何话当真。由于LLM（大型语言模型）的工作原理，生成的输出可能不符合现实，甚至完全是胡说八道。<br />
        Due to how LLM works, generated output <i>and</i> suggestions may not reflect reality, or may be complete nonsense. Please do not take anything it says seriously. This is just a proof of concept, any opinion expressed by this AI does not constitute my actual opinion.
      </Body2>
    </div>
    <Body2 style={css.text}>
      目前基于OpenAI。<br />
      Currently powered by OpenAI. Source code <Link href="https://github.com/micromaomao/chat.maowtm.org" target="_blank">
        available on GitHub
      </Link>
    </Body2>
  </>);
}

function shuffle(array: string[]) {
  for (let i = 0; i < array.length - 1; i += 1) {
    const j = Math.floor(Math.random() * (array.length - i)) + i;
    const temp = array[i];
    array[i] = array[j];
    array[j] = temp;
  }
}

function takeRandom(array: string[], n: number) {
  array = array.slice();
  shuffle(array);
  return array.slice(0, n);
}

export function ChatInitialBannerContent() {
  let list = useMemo(() => {
    const allQuestions = [
      "What are your hobbies?",
      "Do you like reading books? ",
      "Who are you?",
      "Where are you from?",
      "What type of music do you listen? ",
      "Can you suggest me a movie?",
      "Why do you wanna study Biology?",
      "Do you play Genshin Impact?",
      "What would you like to work for?",
    ];
    const rawList = takeRandom(allQuestions, 6);
    shuffle(rawList);
    return rawList;
  }, []);
  const { width } = useWindowSize();
  if (width < 500) {
    list = list.slice(0, 3);
  }
  return (<>
    <Title3 style={{ fontWeight: "normal" }}>Need ideas?</Title3>
    <div style={css.suggestionGrid}>
      {list.map((sugg) => <SugBtn key={sugg}>{sugg}</SugBtn>)}
    </div>
    <Body2>Remember that AI generated output may hallucinate false statements.</Body2>
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
