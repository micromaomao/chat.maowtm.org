import { Suspense } from "react"
import styles from "./layout.module.css"
import Nav from "./nav"
import AdminSkeleton from "./skeleton"
import { SharedStateProvider } from "@/app/utils/sharedstate"
import { cookies, headers } from "next/headers"
import { serverComponentCheckAdminAuthentication } from "@/lib/auth"
import { redirect } from "next/navigation"

export const metadata = {
  title: {
    template: '%s - MaoChat Management'
  }
}

export default async function Layout({
  children,
}: {
  children: React.ReactNode
}) {
  if (headers().get("x-pathname") != "/admin/login" && await serverComponentCheckAdminAuthentication(cookies()) !== true) {
    redirect("/admin/login");
  }
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
