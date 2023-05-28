"use client"

import { Button, Title1 } from "@/app/uicomponents";
import { revalidatePath } from "next/cache";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter()
  const handleLogin = async () => {
    await fetch("/api/admin/login", {
      method: "POST",
    })
    revalidatePath("/admin")
    router.replace("/admin")
  }

  return (
    <div>
      <Title1 as="h1">Admin Login</Title1>
      <br />
      <Button onClick={handleLogin}>Click me</Button>
    </div>
  )
}
