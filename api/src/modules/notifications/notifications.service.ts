import { Injectable } from '@nestjs/common';
import { Subject, Observable, filter, map } from 'rxjs';

export interface NotificationEvent {
  tenantId: string;
  type: string;
  payload: Record<string, any>;
}

/**
 * Thin pub/sub bus for Server-Sent Events.
 * Services call emit(); SSE controller subscribes per tenant.
 */
@Injectable()
export class NotificationsService {
  private readonly bus$ = new Subject<NotificationEvent>();

  emit(event: NotificationEvent) {
    this.bus$.next(event);
  }

  streamForTenant(tenantId: string): Observable<MessageEvent> {
    return this.bus$.pipe(
      filter((e) => e.tenantId === tenantId),
      map((e) => ({ data: { type: e.type, ...e.payload } } as MessageEvent)),
    );
  }

  /** Raw events for a tenant (unmapped) — used when per-viewer filtering is needed. */
  eventsForTenant(tenantId: string): Observable<NotificationEvent> {
    return this.bus$.pipe(filter((e) => e.tenantId === tenantId));
  }

  static toMessageEvent(e: NotificationEvent): MessageEvent {
    return { data: { type: e.type, ...e.payload } } as MessageEvent;
  }
}
