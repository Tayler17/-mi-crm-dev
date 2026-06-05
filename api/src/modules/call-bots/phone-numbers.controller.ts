import { Controller, Get, Post, Delete, Query, Body, Param, UseGuards, Request, ForbiddenException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PhoneNumbersService } from './phone-numbers.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { checkPlanLimit } from '../../common/utils/limits';

@Controller('phone-numbers')
@UseGuards(JwtAuthGuard)
export class PhoneNumbersController {
  constructor(
    private readonly svc: PhoneNumbersService,
    @InjectDataSource() private readonly db: DataSource,
  ) {}

  /** Live Twilio inventory search */
  @Get('search')
  search(
    @Query('country') country?: string,
    @Query('type') type?: string,
    @Query('areaCode') areaCode?: string,
    @Query('contains') contains?: string,
  ) {
    return this.svc.search({ country, type, areaCode, contains });
  }

  /** The tenant's purchased numbers */
  @Get()
  list(@TenantId() tenantId: string) {
    return this.svc.list(tenantId);
  }

  /** Buy a number on demand (admin/owner only, gated by plan limit) */
  @Post('buy')
  async buy(
    @Body() body: { phoneNumber: string; country?: string },
    @TenantId() tenantId: string,
    @Request() req: any,
  ) {
    if (req.user?.role === 'agent') throw new ForbiddenException('Solo administradores pueden comprar números.');
    await checkPlanLimit(this.db, tenantId, 'phone_numbers');
    return this.svc.purchase(tenantId, body.phoneNumber, body.country);
  }

  /** Release a number (admin/owner only) */
  @Delete(':id')
  async release(@Param('id') id: string, @TenantId() tenantId: string, @Request() req: any) {
    if (req.user?.role === 'agent') throw new ForbiddenException('Solo administradores pueden liberar números.');
    return this.svc.release(tenantId, id);
  }

  /** Owner: list all numbers in the master Twilio account */
  @Get('twilio-inventory')
  twilioInventory(@Request() req: any) {
    if (req.user?.role !== 'owner') throw new ForbiddenException();
    return this.svc.twilioInventory();
  }

  /** Owner: assign an existing Twilio number to a specific tenant */
  @Post('assign')
  assign(@Body() body: { phoneNumber: string; tenantId: string }, @Request() req: any) {
    if (req.user?.role !== 'owner') throw new ForbiddenException();
    return this.svc.assignToTenant(body.tenantId, body.phoneNumber);
  }
}
