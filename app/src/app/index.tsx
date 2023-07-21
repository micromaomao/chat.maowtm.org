import React, { Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { FluentProvider, BrandVariants, Theme, createLightTheme, createDarkTheme } from '@fluentui/react-components';

import "./globals.css";
import LoadingPage from './loadingPage';

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

const reactRoot = document.getElementById('react-root');

const Routes = React.lazy(() => import('./routes'));

function RootComponent() {
  return (
    <React.StrictMode>
      <FluentProvider theme={lightTheme}>
        <Suspense fallback={<LoadingPage />}>
          <Routes />
        </Suspense>
      </FluentProvider>
    </React.StrictMode>
  );
}

createRoot(reactRoot).render(
  <RootComponent />
);
