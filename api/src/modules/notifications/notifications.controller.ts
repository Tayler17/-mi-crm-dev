import { Controller, Sse, Req } from '@nestjs/common';
import { Observable } from 'rxjs';
import { NotificationsService } from './notifications.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
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
    try {
      this.jwtService.verify(token, {
        secret: this.config.get('JWT_SECRET') || 'dev_jwt_secret',
      });
    } catch {
      // Return a stream that immediately closes via a one-shot error notice
      return new Observable((subscriber) => subscriber.complete());
    }

    return this.notificationsService.streamForTenant(tenantId);
  }
}
