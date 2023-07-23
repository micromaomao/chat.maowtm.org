import Router from "../lib/promise_router";
import v1router from "./v1";

const apiRouter = Router();

apiRouter.use("/v1", v1router);

export default apiRouter;
