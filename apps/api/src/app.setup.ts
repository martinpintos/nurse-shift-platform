import {
  type INestApplication,
  StandardSchemaValidationPipe,
} from "@nestjs/common";
import type { ErrorResponse } from "@repo/shared";
import type { NextFunction, Request, Response } from "express";
import helmet from "helmet";
import { ErrorResponseFilter } from "./common/error-response.filter.js";

const PREFIX = "api";

/**
 * Nest's not-found handling only covers routes under the global prefix, so anything
 * else would get Express's HTML 404. Answer it with the contract's error shape instead.
 */
function outsidePrefixNotFound(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.path === `/${PREFIX}` || req.path.startsWith(`/${PREFIX}/`)) {
    next();
    return;
  }
  const body: ErrorResponse = { error: `Cannot ${req.method} ${req.path}` };
  res.status(404).json(body);
}

/**
 * App-wide HTTP setup, shared by main.ts and the e2e tests so tests exercise exactly
 * what production serves.
 */
export function configureApp<T extends INestApplication>(app: T): T {
  app.use(helmet());
  app.use(outsidePrefixNotFound);
  app.setGlobalPrefix(PREFIX);
  // Validates every @Body/@Param/@Query that declares a `schema` (the zod schemas in
  // @repo/shared) and passes on the parsed value, unknown keys stripped.
  app.useGlobalPipes(new StandardSchemaValidationPipe());
  app.useGlobalFilters(new ErrorResponseFilter());
  app.enableShutdownHooks();
  return app;
}
