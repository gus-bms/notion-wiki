import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { timingSafeEqual } from "crypto";
import { IS_PUBLIC_KEY } from "./public.decorator";

@Injectable()
export class AppTokenGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ headers: Record<string, string | undefined> }>();
    const token = request.headers.authorization?.replace(/^Bearer\s+/i, "");
    const expected = process.env.APP_TOKEN ?? "";

    if (!token || !expected) {
      throw new UnauthorizedException("Invalid or missing APP token");
    }

    const tokenBuffer = Buffer.from(token, "utf8");
    const expectedBuffer = Buffer.from(expected, "utf8");
    const isMatch =
      tokenBuffer.length === expectedBuffer.length && timingSafeEqual(tokenBuffer, expectedBuffer);

    if (!isMatch) {
      throw new UnauthorizedException("Invalid or missing APP token");
    }

    return true;
  }
}
