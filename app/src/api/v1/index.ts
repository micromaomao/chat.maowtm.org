import { Router } from "express";
import * as OpenApiValidator from "express-openapi-validator";
import apiSpec from "../../../../api.json";
import adminRoutes from "./admin";

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

export default apiRouter;
