import { dot, norm } from "../../lib/vectools";
import get_config_store from "../../db/config";
import { getEmbedding } from "../../lib/chat/ai";
import { Router } from "express";

const apiRouter = Router();

class AuthError {
  status = 401;
  message = "Unauthorized";
}

export async function requireAdminAuth(req, res, next) {
  // TODO
  if (["::1", "127.0.0.1", "::ffff:127.0.0.1"].includes(req.ip) && !req.get("X-Forwarded-For")) {
    return next();
  }
  const auth_error = new AuthError();
  return next(auth_error);
}

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
  const config_store = await get_config_store();
  res.json(config_store.config);
});

apiRouter.put("/global-config", async (req, res) => {
  const config_store = await get_config_store();
  const new_config = req.body;
  await config_store.update_config(new_config);
  res.status(204).send();
});

export default apiRouter;
