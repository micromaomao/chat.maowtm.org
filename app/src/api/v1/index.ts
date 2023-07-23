import { Router } from "express";
import * as OpenApiValidator from "express-openapi-validator";
import apiSpec from "../../../../api.json";
import adminRoutes from "./admin";
import client_tags from "../../db/client_tag";
import { with_db_client } from "../../db";
import { generate_token } from "../../lib/secure_token";

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

apiRouter.use(adminRoutes);

apiRouter.post("/chat-session", async (req, res) => {
  const client_tag = req.body.client_tag;
  const tag_entry = await client_tags.checkTag(client_tag);
  if (tag_entry) {
    res.status(201).json(tag_entry.response);
    return;
  }
  const [token_str, token_buf] = await generate_token();
  const session_id = await with_db_client(async db => {
    const res = await db.query({
      text: "insert into chat_session (session_token) values ($1) returning session_id",
      values: [token_buf],
    });
    return res.rows[0].session_id;
  });
  const ret = {
    session_id, chat_token: token_str,
  };
  await client_tags.setTag(client_tag, ret);
  res.status(201).json(ret);
});

export default apiRouter;
