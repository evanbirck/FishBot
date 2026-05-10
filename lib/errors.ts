export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status = 500,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class ConfigurationError extends AppError {
  constructor(message: string, cause?: unknown) {
    super(message, "configuration_error", 500, cause);
    this.name = "ConfigurationError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(message, "unauthorized", 401);
    this.name = "UnauthorizedError";
  }
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown error";
}
