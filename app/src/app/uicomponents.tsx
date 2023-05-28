'use client'

export { Tab, TabList, type SelectTabEventHandler } from '@fluentui/react-tabs'
export { Combobox, Option } from '@fluentui/react-combobox'
export { Text, Title1, Title2, Body2 } from '@fluentui/react-text'
export { Button } from "@fluentui/react-button"
export { Skeleton, SkeletonItem } from "@fluentui/react-skeleton"
export { Accordion, AccordionHeader, AccordionItem, AccordionPanel } from "@fluentui/react-accordion"
export { Alert } from '@fluentui/react-components/unstable'
export { Field } from '@fluentui/react-field'
export { Textarea } from '@fluentui/react-textarea'
export { Link } from '@fluentui/react-link'
export { ProgressBar } from '@fluentui/react-progress'
export { ArrowHookDownLeftRegular, CodeRegular, bundleIcon, Home24Regular, Home24Filled, LockClosedFilled, DeleteRegular, AddCircleRegular } from "@fluentui/react-icons"

import { FluentProvider, BrandVariants, createDarkTheme, createLightTheme, Theme } from '@fluentui/react-components'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const maochat: BrandVariants = {
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

  const lightTheme: Theme = {
    ...createLightTheme(maochat),
  };

  const darkTheme: Theme = {
    ...createDarkTheme(maochat),
  };


  darkTheme.colorBrandForeground1 = maochat[110];
  darkTheme.colorBrandForeground2 = maochat[120];

  let doc = undefined;
  if (typeof window !== 'undefined') {
    doc = window.document;
  }

  return (
    <FluentProvider theme={lightTheme} targetDocument={doc}>
      {children}
    </FluentProvider>
  )
}
