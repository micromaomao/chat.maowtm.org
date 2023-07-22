import express from "express";
import api from "./api";
import * as db from "./db";

(async () => {
  await db.init();

  const app = express();

  app.use(express.text({ type: "text/plain" }));
  app.use(express.json({ type: "application/json" }));

  app.use("/api", api);

  app.use(express.static("./dist"));

  app.listen(3000, () => {
    console.log("Server is running at http://localhost:3000");
  });
})();
