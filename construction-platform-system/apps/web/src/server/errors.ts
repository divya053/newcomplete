/**
 * Typed error hierarchy → ONE response shape (ws 0.10). Server actions / route
 * handlers throw these; a single mapper turns them into a consistent envelope so
 * the client always sees the same structure. No leaking stack traces.
 */
export class AppError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super("validation_error", message, 400);
  }
}
export class UnauthorizedError extends AppError {
  constructor(message = "Not authenticated") {
    super("unauthorized", message, 401);
  }
}
export class ForbiddenError extends AppError {
  constructor(permission: string) {
    super("forbidden", `Missing permission: ${permission}`, 403);
  }
}
export class NotFoundError extends AppError {
  constructor(entity: string) {
    super("not_found", `${entity} not found`, 404);
  }
}

export interface ErrorResponse {
  error: { code: string; message: string };
}

export function toErrorResponse(e: unknown): { status: number; body: ErrorResponse } {
  if (e instanceof AppError) {
    return { status: e.status, body: { error: { code: e.code, message: e.message } } };
  }
  // Never leak internals.
  return { status: 500, body: { error: { code: "internal_error", message: "Internal server error" } } };
}
