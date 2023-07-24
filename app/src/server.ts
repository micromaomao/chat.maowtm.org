import express from "express";
import api from "./api";
import * as db from "./db";
import { OpenAIError } from "./lib/ai/openai";
import { APIError } from "./api/basic";

(async () => {
  await db.init();

  const app = express();

  app.use(express.text({ type: "text/plain" }));
  app.use(express.json({ type: "application/json" }));

  app.use("/api", api);

  app.use(express.static("./dist"));

  app.use("/api", (err, req, res, next) => {
    if (err instanceof APIError) {
      res.status(err.status);
      res.type("text");
      res.send(err.message);
    } else if (err.status >= 400 && err.status < 500) {
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

  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).send("Something broke!");
  })

  app.listen(3000, () => {
    console.log("Server is running at http://localhost:3000");
  });
})();
