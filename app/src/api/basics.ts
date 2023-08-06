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

export class APIValidationError extends APIError {
  constructor(message: string) {
    super(400, message);
  }
}
