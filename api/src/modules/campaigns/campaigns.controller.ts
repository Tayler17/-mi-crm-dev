import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, Request } from '@nestjs/common';
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto, UpdateCampaignDto, AddContactsDto, AddContactsByFilterDto } from './dto/campaign.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantId } from '../../common/decorators/tenant.decorator';

@Controller('campaigns')
@UseGuards(JwtAuthGuard)
export class CampaignsController {
  constructor(private readonly svc: CampaignsService) {}

  @Get()
  findAll(@TenantId() tenantId: string) {
    return this.svc.findAll(tenantId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.svc.findOne(id, tenantId);
  }

  @Post()
  create(@Body() dto: CreateCampaignDto, @TenantId() tenantId: string, @Request() req: any) {
    return this.svc.create(dto, tenantId, req.user?.id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCampaignDto, @TenantId() tenantId: string) {
    return this.svc.update(id, dto, tenantId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.svc.remove(id, tenantId);
  }

  // ── Target Lists (audience: contact_lists) ───────────────────────────────────

  @Get(':id/lists')
  getTargetLists(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.svc.getTargetLists(id, tenantId);
  }

  @Post(':id/lists/:listId')
  addTargetList(@Param('id') id: string, @Param('listId') listId: string, @TenantId() tenantId: string) {
    return this.svc.addTargetList(id, listId, tenantId);
  }

  @Delete(':id/lists/:listId')
  removeTargetList(@Param('id') id: string, @Param('listId') listId: string, @TenantId() tenantId: string) {
    return this.svc.removeTargetList(id, listId, tenantId);
  }

  // ── Individual Recipients ────────────────────────────────────────────────────

  @Get(':id/contacts')
  getRecipients(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.svc.getRecipients(id, tenantId);
  }

  @Get(':id/contacts/search')
  searchContacts(
    @Param('id') id: string,
    @TenantId() tenantId: string,
    @Query('search') search?: string,
    @Query('tagIds') tagIds?: string,
  ) {
    const tags = tagIds ? tagIds.split(',').filter(Boolean) : undefined;
    return this.svc.searchAvailableContacts(id, tenantId, search, tags);
  }

  @Post(':id/contacts')
  addRecipients(@Param('id') id: string, @Body() dto: AddContactsDto, @TenantId() tenantId: string) {
    return this.svc.addRecipients(id, dto, tenantId);
  }

  @Post(':id/contacts/bulk')
  addByFilter(@Param('id') id: string, @Body() dto: AddContactsByFilterDto, @TenantId() tenantId: string) {
    return this.svc.addRecipientsByFilter(id, dto, tenantId);
  }

  @Delete(':id/contacts')
  clearRecipients(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.svc.clearRecipients(id, tenantId);
  }

  @Delete(':id/contacts/:contactId')
  removeRecipient(@Param('id') id: string, @Param('contactId') contactId: string, @TenantId() tenantId: string) {
    return this.svc.removeRecipient(id, contactId, tenantId);
  }

  // ── Resolve full recipient list (lists + individuals) ────────────────────────

  @Get(':id/recipients')
  resolveRecipients(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.svc.resolveAllRecipients(id, tenantId);
  }

  // ── Status transitions ────────────────────────────────────────────────────────

  @Post(':id/launch')
  launch(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.svc.launch(id, tenantId);
  }

  @Post(':id/pause')
  pause(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.svc.pause(id, tenantId);
  }
}
