import React, { Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { FluentProvider, Theme, createLightTheme, createDarkTheme, Toaster } from '@fluentui/react-components';

import "./globals.css";
import LoadingPage from './loadingPage';
import { PROJECT_NAME, maochatTheme } from './client_config';

const lightTheme: Theme = {
  ...createLightTheme(maochatTheme),
};

const darkTheme: Theme = {
  ...createDarkTheme(maochatTheme),
};


darkTheme.colorBrandForeground1 = maochatTheme[110];
darkTheme.colorBrandForeground2 = maochatTheme[120];

const reactRoot = document.getElementById('react-root');

document.title = PROJECT_NAME;

const Routes = React.lazy(() => import('./routes'));

function RootComponent() {
  return (
    <React.StrictMode>
      <FluentProvider theme={lightTheme}>
        <Toaster />
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
