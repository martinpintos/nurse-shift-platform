import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AuthenticationModule } from "@nestjs/authentication";
import { AuthorizationModule } from "@nestjs/authorization";
import type { Env } from "../config/env.js";
import { RolePolicy } from "./access.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import {
  JWT_AUDIENCE,
  JWT_ISSUER,
  JWT_TTL,
  JwtAuthProvider,
} from "./jwt-auth.provider.js";
import { LoginThrottle } from "./login-throttle.js";

/**
 * Sign-in and permissions. Both modules register global guards, in this order:
 * authentication (every route needs a valid Bearer token unless `@Public()`), then
 * authorization (every handler needs a `@Can()` check, applied with `@Access()`).
 */
@Module({
  imports: [
    AuthenticationModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        accessToken: {
          key: config.get("JWT_SECRET", { infer: true }),
          issuer: JWT_ISSUER,
          audience: JWT_AUDIENCE,
          ttl: JWT_TTL,
        },
        // No refresh tokens, so no token store: clients sign in again after 8h.
        refreshToken: false,
      }),
    }),
    AuthorizationModule.forRoot(),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthProvider, LoginThrottle, RolePolicy],
})
export class AuthModule {}
