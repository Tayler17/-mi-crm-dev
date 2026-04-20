import { Controller, Get, Post, Param, Body, UseGuards, Request, Query } from '@nestjs/common';
import { InternalChatService } from './internal-chat.service';
import { CreateChatDto, SendMessageDto } from './dto/internal-chat.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantId } from '../../common/decorators/tenant.decorator';

@Controller('internal-chat')
@UseGuards(JwtAuthGuard)
export class InternalChatController {
  constructor(private readonly svc: InternalChatService) {}

  @Get()
  getMyChats(@TenantId() tenantId: string, @Request() req: any) {
    return this.svc.findMyChats(tenantId, req.user.id);
  }

  @Post()
  createOrFindDm(
    @TenantId() tenantId: string,
    @Request() req: any,
    @Body() dto: CreateChatDto,
  ) {
    return this.svc.findOrCreateDm(tenantId, req.user.id, dto);
  }

  @Get(':id/messages')
  getMessages(
    @Param('id') chatId: string,
    @TenantId() tenantId: string,
    @Request() req: any,
    @Query('limit') limit?: string,
  ) {
    return this.svc.getMessages(chatId, tenantId, req.user.id, limit ? +limit : 50);
  }

  @Post(':id/messages')
  sendMessage(
    @Param('id') chatId: string,
    @TenantId() tenantId: string,
    @Request() req: any,
    @Body() dto: SendMessageDto,
  ) {
    return this.svc.sendMessage(chatId, tenantId, req.user.id, dto);
  }

  @Post(':id/read')
  markRead(@Param('id') chatId: string, @Request() req: any) {
    return this.svc.markRead(chatId, req.user.id);
  }
}
