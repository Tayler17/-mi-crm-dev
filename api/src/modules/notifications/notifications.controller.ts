import { Controller, Sse, Req } from '@nestjs/common';
import { Observable, EMPTY, from, of } from 'rxjs';
import { mergeMap, switchMap } from 'rxjs/operators';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { NotificationsService } from './notifications.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    @InjectDataSource() private readonly db: DataSource,
  ) {}

  /**
   * GET /notifications/stream?token=<jwt>&tenantId=<id>
   * EventSource cannot send Authorization headers, so we accept credentials
   * via query params for this endpoint only.
   */
  @Sse('stream')
  stream(@Req() req: any): Observable<MessageEvent> {
    // Extract token and tenantId from query params (EventSource limitation)
    const token: string = req.query?.token ?? '';
    const tenantId: string = req.query?.tenantId ?? req.tenantId ?? '';

    // Verify token — if invalid just return an empty stream (client will reconnect)
    let claims: any;
    try {
      claims = this.jwtService.verify(token, {
        secret: this.config.get('JWT_SECRET') || 'dev_jwt_secret', // dev fallback only — JWT_SECRET required in production
      });
    } catch {
      // Return a stream that immediately closes via a one-shot error notice
      return new Observable((subscriber) => subscriber.complete());
    }

    const userId: string = claims?.sub ?? '';
    const role: string = claims?.role ?? 'agent';

    // Admins/owners receive everything. Agents are scoped to their teams only
    // when the tenant has enabled the restriction.
    if (role === 'admin' || role === 'owner') {
      return this.notificationsService.streamForTenant(tenantId);
    }

    return from(this.isRestricted(tenantId)).pipe(
      switchMap((restricted) => {
        if (!restricted) return this.notificationsService.streamForTenant(tenantId);
        return this.notificationsService.eventsForTenant(tenantId).pipe(
          mergeMap((e) => {
            const convId: string | undefined = e.payload?.conversationId;
            // Events not tied to a conversation pass through unchanged.
            if (!convId) return of(NotificationsService.toMessageEvent(e));
            return from(this.canAccess(tenantId, userId, convId)).pipe(
              mergeMap((ok) => (ok ? of(NotificationsService.toMessageEvent(e)) : EMPTY)),
            );
          }),
        );
      }),
    );
  }

  /** Is team-based conversation restriction enabled for this tenant? */
  private async isRestricted(tenantId: string): Promise<boolean> {
    try {
      const [t] = await this.db.query(
        `SELECT settings->>'restrictAgentsToTeams' AS flag FROM tenants WHERE id = $1`,
        [tenantId],
      );
      return t?.flag === 'true';
    } catch {
      return false;
    }
  }

  /** Can this agent access (see) the given conversation under team scoping? */
  private async canAccess(tenantId: string, userId: string, conversationId: string): Promise<boolean> {
    try {
      const rows = await this.db.query(
        `SELECT 1 FROM conversations c
          WHERE c.id = $2 AND c.tenant_id = $1 AND (
            c.assigned_to = $3 OR c.assigned_user_id = $3
            OR c.team_id IN (SELECT team_id FROM team_members WHERE user_id = $3)
            OR c.queue_id IN (SELECT id FROM queues WHERE team_id IN (SELECT team_id FROM team_members WHERE user_id = $3))
            OR (c.team_id IS NULL AND c.queue_id IS NULL)
          ) LIMIT 1`,
        [tenantId, conversationId, userId],
      );
      return rows.length > 0;
    } catch {
      return true; // fail open — never silently drop all notifications on error
    }
  }
}
