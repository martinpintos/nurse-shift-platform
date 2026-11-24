import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { ErrorResponse } from "@repo/shared";
import type { Response } from "express";

/** Maps any thrown value to the spec's error shape. Unknown errors never leak details. */
export function toErrorResponse(exception: unknown): {
  status: number;
  body: ErrorResponse;
} {
  if (exception instanceof HttpException) {
    return {
      status: exception.getStatus(),
      body: { error: messageOf(exception) },
    };
  }
  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    body: { error: "Internal server error" },
  };
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
