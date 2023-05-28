import { Title2 } from "@/app/uicomponents"

export const metadata = {
  title: 'MaoChat Management'
}

export default async function AdminHome() {
  return (
    <div>
      <Title2 as="h2">Admin interface</Title2>
    </div>
  )
}
