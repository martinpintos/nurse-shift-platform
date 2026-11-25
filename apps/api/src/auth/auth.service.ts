import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { PasswordHasher, TokenService } from "@nestjs/authentication";
import {
  ERROR_MESSAGES,
  type LoginRequest,
  type LoginResponse,
  type MeResponse,
} from "@repo/shared";
import { PrismaService } from "../prisma/prisma.service.js";
import { LoginThrottle, normalizeEmail } from "./login-throttle.js";
import type { Principal } from "./principal.js";

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PasswordHasher) private readonly hasher: PasswordHasher,
    @Inject(TokenService) private readonly tokens: TokenService,
    @Inject(LoginThrottle) private readonly throttle: LoginThrottle,
  ) {}

  /**
   * Email and password sign-in. Emails are stored lowercased (the seed writes them), so a
   * trimmed, lowercased lookup on the unique index matches case-insensitively. A wrong
   * email and a wrong password get the same 401 in the same time: the hasher checks a
   * dummy hash when there is no user.
   */
  async login({ email, password }: LoginRequest): Promise<LoginResponse> {
    const normalized = normalizeEmail(email);
    if (this.throttle.isBlocked(normalized)) {
      throw new HttpException(
        ERROR_MESSAGES.tooManyLoginAttempts,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { email: normalized },
    });
    const valid = await this.hasher.verify(password, user?.passwordHash);
    if (!valid || !user) {
      this.throttle.recordFailure(normalized);
      throw new UnauthorizedException(ERROR_MESSAGES.invalidCredentials);
    }
    this.throttle.recordSuccess(normalized);

    const { accessToken } = await this.tokens.issue(user.id, {
      method: "password",
      claims: { role: user.role, agencyId: user.agencyId },
    });
    return {
      token: accessToken,
      user: { id: user.id, name: user.name, role: user.role },
    };
  }

  async me(principal: Principal): Promise<MeResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: principal.id },
      select: { id: true, name: true, role: true, agencyId: true },
    });
    if (!user) {
      // A valid token for a user that no longer exists.
      throw new UnauthorizedException(ERROR_MESSAGES.invalidToken);
    }
    return user;
  }
}
