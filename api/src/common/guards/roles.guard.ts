import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

// Hierarchy: owner > admin > agent
const ROLE_RANK: Record<string, number> = { owner: 100, admin: 50, agent: 10 };

export function hasRole(userRole: string, requiredRole: string): boolean {
  return (ROLE_RANK[userRole] ?? 0) >= (ROLE_RANK[requiredRole] ?? 0);
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const roles = this.reflector.get<string[]>('roles', ctx.getHandler());
    if (!roles || roles.length === 0) return true;
    const { user } = ctx.switchToHttp().getRequest();
    if (!user) throw new ForbiddenException('Acceso denegado');
    // Pass if user's rank >= ANY required role's rank
    const allowed = roles.some((r) => hasRole(user.role, r));
    if (!allowed) throw new ForbiddenException('Acceso denegado');
    return true;
  }
}
