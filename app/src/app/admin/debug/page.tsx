import { AccordionHeader, AccordionItem, AccordionPanel } from "@/app/uicomponents"
import EmbeddingsTest from "./embeddingsTest"
import Accordion from "@/app/utils/sharedstateaccordion"
import { KnownEmbeddingModels } from "@/lib/chat/ai"

export const metadata = {
  title: 'Debug tools'
}

export default async function AdminDebug() {
  return (
    <div>
      <Accordion stateId="adminDebugAccordion" collapsible={true} multiple={true} defaultOpenItems={["1"]}>
        <AccordionItem value="1">
          <AccordionHeader size="extra-large">Embeddings testing</AccordionHeader>
          <AccordionPanel>
            <EmbeddingsTest available_models={KnownEmbeddingModels} />
          </AccordionPanel>
        </AccordionItem>
      </Accordion>
    </div>
  )
}
