import {
  Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Put, Request, UseGuards,
} from '@nestjs/common';
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
  // NOTE: declared BEFORE the ':id' routes so /invoices/settings is not captured by :id.
  @Get('settings')
  getSettings(@TenantId() tenantId: string) {
    return this.invoices.getSettings(tenantId);
  }

  @Put('settings')
  @UseGuards(RolesGuard)
  @Roles('admin')
  updateSettings(@TenantId() tenantId: string, @Body() dto: Record<string, any>) {
    return this.invoices.updateSettings(tenantId, dto);
  }

  // ── Draft invoices CRUD (view/create/edit/delete = agent+) ──────────────────
  @Post()
  createDraft(@TenantId() tenantId: string, @Request() req: any, @Body() dto: any) {
    return this.invoices.createDraft(tenantId, req.user?.id ?? null, dto);
  }

  @Get()
  list(@TenantId() tenantId: string) {
    return this.invoices.list(tenantId);
  }

  @Get(':id')
  async getOne(@TenantId() tenantId: string, @Param('id') id: string) {
    const inv = await this.invoices.getOne(tenantId, id);
    if (!inv) throw new NotFoundException('Factura no encontrada');
    return inv;
  }

  @Patch(':id')
  updateDraft(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: any) {
    return this.invoices.updateDraft(tenantId, id, dto);
  }

  @Delete(':id')
  deleteDraft(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.invoices.deleteDraft(tenantId, id);
  }
}
