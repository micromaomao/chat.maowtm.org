export class APIError extends Error {
  status;
  constructor(status?: number, message?: string) {
    super(message || "Unknown error");
    this.status = status || 500;
  }
}

export class AuthError extends APIError {
  constructor() {
    super(401, "Unauthorized");
  }
}

export class InvalidChatSessionError extends APIError {
  constructor() {
    super(404, "Invalid chat ID or token");
  }
}

export async function hasValidAdminAuth(req): Promise<boolean> {
  // TODO
  return (
    process.env.NODE_ENV == "development" &&
    ["::1", "127.0.0.1", "::ffff:127.0.0.1"].includes(req.ip) && !req.get("X-Forwarded-For")
  );
}

export async function requireAdminAuth(req, res, next) {
  if (await hasValidAdminAuth(req) === true) {
    return next();
  }
  const auth_error = new AuthError();
  return next(auth_error);
}
