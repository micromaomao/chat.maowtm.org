import { Router } from "express";
import * as OpenApiValidator from "express-openapi-validator";
import { OpenAIError, getEmbedding } from "./lib/chat/ai";
import { dot, norm } from "./lib/vectools";
import apiSpec from "../../api-spec/api.json";

const apiRouter = Router();

apiRouter.get('/spec', (req, res) => {
  res.json(apiSpec);
});

apiRouter.use(OpenApiValidator.middleware({
  apiSpec: apiSpec as any,
  validateRequests: true,
  validateResponses: process.env.NODE_ENV !== "production",
  validateSecurity: false,
  validateApiSpec: false, // The package does not do API spec validation correctly.
}));

apiRouter.get("/debug-embeddings", async (req, res) => {
  // TODO: check auth

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

apiRouter.use((err, req, res, next) => {
  if (err.status >= 400 && err.status < 500) {
    res.status(err.status);
    res.type("text");
    res.send(`API validation error: ${err.message}`);
  } else if (err instanceof OpenAIError) {
    res.status(500);
    res.type("text");
    res.send(`OpenAI error: ${err.message}`);
  } else {
    next(err);
  }
});

export default apiRouter;
