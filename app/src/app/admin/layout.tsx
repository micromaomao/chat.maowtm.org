import { Suspense } from "react"
import styles from "./layout.module.css"
import Nav from "./nav"
import AdminSkeleton from "./skeleton"
import { SharedStateProvider } from "@/app/utils/sharedstate"
import { cookies } from "next/headers"

export const metadata = {
  title: {
    template: '%s - MaoChat Management'
  }
}

export default function Layout({
  children,
}: {
  children: React.ReactNode
}) {
  cookies();
  return (
    <div className={styles.container}>
      <SharedStateProvider sessionStorageId="admin-ui-state">
        <nav className={styles.nav}>
          <Nav />
        </nav>
        <main className={styles.main}>
          <Suspense fallback={<AdminSkeleton />}>
            {children}
          </Suspense>
        </main>
      </SharedStateProvider>
    </div>
  )
}
