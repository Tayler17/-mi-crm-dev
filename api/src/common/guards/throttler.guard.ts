import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerException, ThrottlerLimitDetail } from '@nestjs/throttler';

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  protected async throwThrottlingException(
    _context: ExecutionContext,
    limitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    const waitSeconds = Math.ceil(limitDetail.ttl / 1000);
    throw new ThrottlerException(
      `Demasiados intentos. Por favor espera ${waitSeconds} segundo${waitSeconds !== 1 ? 's' : ''} antes de intentarlo de nuevo.`,
    );
  }
}
