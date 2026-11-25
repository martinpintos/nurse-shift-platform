import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { AuthenticationError } from "@nestjs/authentication";
import { AuthorizationError } from "@nestjs/authorization";
import { ERROR_MESSAGES, type ErrorResponse } from "@repo/shared";
import type { Response } from "express";

/** Maps any thrown value to the spec's error shape. Unknown errors never leak details. */
export function toErrorResponse(exception: unknown): {
  status: number;
  body: ErrorResponse;
} {
  if (exception instanceof HttpException) {
    return {
      status: exception.getStatus(),
      body: { error: authMessageOf(exception) ?? messageOf(exception) },
    };
  }
  if (exception instanceof AuthenticationError) {
    return {
      status: HttpStatus.UNAUTHORIZED,
      body: { error: ERROR_MESSAGES.invalidToken },
    };
  }
  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    body: { error: "Internal server error" },
  };
}

/**
 * The guards of `@nestjs/authentication` and `@nestjs/authorization` throw Nest's own
 * 401/403 exceptions with generic bodies ("Unauthorized", "Forbidden"). They are told
 * apart by what the libraries attach: `errorCode: "missing_credentials"` when no token was
 * sent, an `AuthenticationError` cause when one failed verification, an
 * `AuthorizationError` cause when a role check denied.
 */
function authMessageOf(exception: HttpException): string | undefined {
  const { cause } = exception;
  if (cause instanceof AuthorizationError) {
    return cause.reason === "forbidden"
      ? ERROR_MESSAGES.forbidden
      : ERROR_MESSAGES.authRequired;
  }
  if (exception.errorCode === "missing_credentials") {
    return ERROR_MESSAGES.authRequired;
  }
  if (cause instanceof AuthenticationError) {
    return ERROR_MESSAGES.invalidToken;
  }
  return undefined;
}

function messageOf(exception: HttpException): string {
  const response = exception.getResponse();
  if (typeof response === "string" && response) return response;
  if (
    typeof response === "object" &&
    response !== null &&
    "message" in response
  ) {
    const { message } = response;
    if (typeof message === "string" && message) return message;
    if (Array.isArray(message) && message.length > 0) {
      return message.map(String).join("; ");
    }
  }
  return exception.message;
}

/** Every error response, on every route, is `{ "error": "<message>" }` (docs/spec.md). */
@Catch()
export class ErrorResponseFilter implements ExceptionFilter {
  private readonly logger = new Logger(ErrorResponseFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const { status, body } = toErrorResponse(exception);
    if (status >= 500) {
      this.logger.error(
        exception instanceof Error
          ? (exception.stack ?? exception.message)
          : String(exception),
      );
    }
    host.switchToHttp().getResponse<Response>().status(status).json(body);
  }
}
