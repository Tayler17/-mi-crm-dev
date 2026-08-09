import { Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
import { AiAgentService } from './ai-agent.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantId } from '../../common/decorators/tenant.decorator';

@Controller('ai-agent')
@UseGuards(JwtAuthGuard)
export class AiAgentController {
  constructor(private readonly svc: AiAgentService) {}

  /** Business AI Assistant: send the conversation history, get the agent's reply + actions. */
  @Post('chat')
  chat(
    @Body() dto: { messages?: { role: 'user' | 'assistant'; content: string }[] },
    @TenantId() tenantId: string,
    @Request() req: any,
  ) {
    return this.svc.chat(tenantId, req?.user?.role, dto?.messages ?? []);
  }
}
