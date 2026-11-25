import { Inject, Injectable } from "@nestjs/common";
import {
  AuthenticationRegistry,
  JwtBearerProvider,
  type JwtClaims,
} from "@nestjs/authentication";
import { principalFromClaims, type Principal } from "./principal.js";

/** Token settings. The key is JWT_SECRET (see AuthModule); HS256 is the default for a secret. */
export const JWT_ISSUER = "shiftpatch-api";
export const JWT_AUDIENCE = "shiftpatch-web";
export const JWT_TTL = "8h";

/**
 * `Authorization: Bearer <jwt>` for every route not marked `@Public()`. The library checks
 * the signature, `exp`, `iss` and `aud`; this maps the verified claims to the caller.
 *
 * The token is the session: users only come from the seed and are never edited, so there
 * is nothing a per-request database read would catch. Claims that don't describe a valid
 * caller (an unknown role, an agency login without an agency) reject the token.
 */
@Injectable()
export class JwtAuthProvider extends JwtBearerProvider<Principal> {
  constructor(
    @Inject(AuthenticationRegistry) registry: AuthenticationRegistry,
  ) {
    super({ realm: "shiftpatch" });
    registry.registerProvider(this);
  }

  protected validate(claims: JwtClaims): Principal | null {
    return principalFromClaims(claims);
  }
}
