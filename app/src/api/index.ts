import { Hono } from "hono";
import type { Env } from "../env";
import v1 from "./v1";

const app = new Hono<{ Bindings: Env }>();
app.route("/v1", v1);
export default app;
