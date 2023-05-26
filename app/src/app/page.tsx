import Link from "next/link"
import styles from "./page.module.css"

import { Button, Alert, Title1 } from '@/app/uicomponent'

export default function Home() {
  return (
    <main className={styles.main}>
      <Title1 as="h1">secret project!</Title1>
      <Alert intent="warning">This page is not ready.</Alert>
      <div style={{ height: 20 }}></div>
      <Link href="/admin">
        <Button appearance='primary'>Open admin interface</Button>
      </Link>
    </main>
  )
}
