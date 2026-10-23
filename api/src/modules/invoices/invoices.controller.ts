import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { InvoicesService } from './invoices.service';

@Controller('invoices')
@UseGuards(JwtAuthGuard)
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  // ── Issuer settings (Ajustes → Facturación) ────────────────────────────────
  /** Read issuer settings — any tenant member may view. */
  @Get('settings')
  getSettings(@TenantId() tenantId: string) {
    return this.invoices.getSettings(tenantId);
  }

  /** Update issuer settings — admins only (RBAC: void/credit_note/refund/settings = admin). */
  @Put('settings')
  @UseGuards(RolesGuard)
  @Roles('admin')
  updateSettings(@TenantId() tenantId: string, @Body() dto: Record<string, any>) {
    return this.invoices.updateSettings(tenantId, dto);
  }
}
