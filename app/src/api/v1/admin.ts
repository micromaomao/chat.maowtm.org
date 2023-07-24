import { dot, norm } from "../../lib/vectools";
import getConfigStore from "../../db/config";
import { getEmbedding } from "../../lib/ai/openai";
import Router from "../../lib/promise_router";
import { requireAdminAuth } from "../basic";

const apiRouter = Router();

apiRouter.use(requireAdminAuth);

apiRouter.get("/debug-embeddings", async (req, res) => {
  const params = req.query as any;
  const model = params.model;
  let inputs = params.input;
  if (typeof inputs === "string") {
    inputs = [inputs];
  }
  let total_tokens = 0;
  const abortController = new AbortController();
  try {
    const embeddings = await Promise.all(inputs.map(async input => {
      const res = await getEmbedding({ model }, input, abortController.signal);
      total_tokens += res.token_count;
      return res.result;
    }));
    const norms = embeddings.map(e => norm(e));
    const similarities = [1];
    for (let i = 1; i < embeddings.length; i += 1) {
      similarities.push(dot(embeddings[0], embeddings[i]) / (norms[0] * norms[i]));
    }
    res.json({
      embeddings, similarities, total_tokens,
    });
  } catch (e) {
    abortController.abort();
    throw e;
  }
});

apiRouter.get("/global-config", async (req, res) => {
  const config_store = await getConfigStore();
  res.json(config_store.config);
});

apiRouter.put("/global-config", async (req, res) => {
  const config_store = await getConfigStore();
  const new_config = req.body;
  await config_store.updateConfig(new_config);
  res.status(204).send();
});

export default apiRouter;
