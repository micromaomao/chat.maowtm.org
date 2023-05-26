'use client'

/**
 * This file is needed to mark all fluentui components as needed to be bundled
 * to the client.
 */

export * from '@fluentui/react-components'
import { FluentProvider, webLightTheme, BrandVariants, createDarkTheme, createLightTheme, Theme } from '@fluentui/react-components'
export { Alert } from '@fluentui/react-components/unstable'

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
  return (
    <FluentProvider theme={lightTheme}>
      {children}
    </FluentProvider>
  )
}
