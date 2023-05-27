import { AccordionHeader, AccordionItem, AccordionPanel } from "@/app/uicomponents"
import EmbeddingsTest from "./embeddingsTest"
import Accordion from "@/app/utils/sharedstateaccordion"

export const metadata = {
  title: 'Debug tools'
}

export default function AdminDebug() {
  return (
    <main>
      <Accordion stateId="adminDebugAccordion" collapsible={true} multiple={true} defaultOpenItems={["1"]}>
        <AccordionItem value="1">
          <AccordionHeader size="extra-large">Embeddings testing</AccordionHeader>
          <AccordionPanel>
            <EmbeddingsTest />
          </AccordionPanel>
        </AccordionItem>
      </Accordion>
    </main>
  )
}
