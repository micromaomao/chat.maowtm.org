import React from "react";
import { AccordionHeader, AccordionItem, AccordionPanel } from "@fluentui/react-components";
import EmbeddingsTest from "./embeddingsTest";
import Accordion from "app/utils/sharedstateaccordion";
import { KnownEmbeddingModels } from "lib/openai";

export function Component() {
  return (
    <div>
      <Accordion stateId="admin.debug.accordion" collapsible={true} multiple={true} defaultOpenItems={["1"]}>
        <AccordionItem value="1">
          <AccordionHeader size="extra-large">Embeddings testing</AccordionHeader>
          <AccordionPanel>
            <EmbeddingsTest available_models={KnownEmbeddingModels} />
          </AccordionPanel>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
