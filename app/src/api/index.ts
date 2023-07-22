import { Router } from "express";
import { OpenAIError } from "../lib/chat/ai";
import v1router from "./v1";

const apiRouter = Router();

apiRouter.use("/v1", v1router);

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
