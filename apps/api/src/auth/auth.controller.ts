import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Ip,
  Post,
} from "@nestjs/common";
import { CurrentUser } from "@nestjs/authentication";
import {
  LoginRequestSchema,
  type LoginRequest,
  type LoginResponse,
  type MeResponse,
} from "@repo/shared";
import { Access } from "./access.js";
import { AuthService } from "./auth.service.js";
import type { Principal } from "./principal.js";

@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  /** POST /api/auth/login. `ip` is Express's `req.ip`, which honours TRUST_PROXY_HOPS. */
  @Post("login")
  @Access("POST /api/auth/login")
  @HttpCode(HttpStatus.OK)
  login(
    @Body({ schema: LoginRequestSchema }) body: LoginRequest,
    @Ip() ip: string | undefined,
  ): Promise<LoginResponse> {
    return this.auth.login(body, ip ?? "unknown");
  }

  @Get("me")
  @Access("GET /api/auth/me")
  me(@CurrentUser() principal: Principal): Promise<MeResponse> {
    return this.auth.me(principal);
  }
}
