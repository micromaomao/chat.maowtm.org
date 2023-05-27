"use client"

import { useSharedState } from "./sharedstate";
import { Accordion as FluentAccordion } from "@/app/uicomponents"

export default function Accordion({ children, stateId, defaultOpenItems, ...props }: {
  children: React.ReactNode,
  stateId: string|symbol,
  defaultOpenItems?: string[],
  [key: string]: any
}) {
  const [openItems, setOpenItems] = useSharedState<string[]>(stateId, defaultOpenItems || []);
  const handleToggle = (_: any, {value: item}: any) => {
    if (openItems.includes(item)) {
      setOpenItems(openItems.filter((i: any) => i !== item));
    } else {
      setOpenItems([...openItems, item]);
    }
  }
  return (
    <FluentAccordion {...props} openItems={openItems} onToggle={handleToggle}>
      {children}
    </FluentAccordion>
  )
}
