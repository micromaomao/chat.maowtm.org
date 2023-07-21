import express from "express";

import api from "./api";

const app = express();

app.use(express.text({ type: "text/plain" }));
app.use(express.json({ type: "application/json" }));

app.use("/api/v1", api);

app.use(express.static("./dist"));

app.listen(3000, () => {
  console.log("Server is running at http://localhost:3000");
});
