import './globals.css'

import { ThemeProvider } from './uicomponent'

export const metadata = {
  title: 'MaoChat'
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
