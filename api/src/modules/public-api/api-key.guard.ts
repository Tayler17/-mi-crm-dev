import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, createParamDecorator } from '@nestjs/common';
import { PublicApiService } from './public-api.service';

/** Guards /v1 routes: requires a valid API key via `Authorization: Bearer <key>` or `X-API-Key`. */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly svc: PublicApiService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const raw = req.headers['authorization'] || req.headers['x-api-key'];
    const auth = await this.svc.authenticate(raw);
    if (!auth) throw new UnauthorizedException('Invalid or missing API key');
    req.apiTenantId = auth.tenantId;
    req.apiKeyId = auth.keyId;
    return true;
  }
}

/** Param decorator: the tenant id resolved from the API key. */
export const ApiTenantId = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  return ctx.switchToHttp().getRequest().apiTenantId;
});
