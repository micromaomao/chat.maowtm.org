import { RateLimitBumpResponse } from "db/rate_limit";

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

export class GlobalChatRateLimitExceeded extends APIError {
  constructor(
    public readonly rateLimitRes: RateLimitBumpResponse,
  ) {
    let seconds = rateLimitRes.reset_remaining_secs;
    let minutes = Math.floor(seconds / 60);
    let human = `${seconds} seconds`;
    if (minutes >= 1) {
      human = `${minutes} minute${minutes > 1 ? "s" : ""}`;
    }
    super(503, `Chat has been temporarily disabled due to reaching the global rate limit. Please try again in ${human}.`);
  }
}
