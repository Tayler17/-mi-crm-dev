import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { ContactListsService } from './contact-lists.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantId } from '../../common/decorators/tenant.decorator';

@Controller('contact-lists')
@UseGuards(JwtAuthGuard)
export class ContactListsController {
  constructor(private readonly service: ContactListsService) {}

  @Get()
  findAll(@TenantId() tenantId: string) {
    return this.service.findAll(tenantId);
  }

  @Post()
  create(@Body() body: { name: string; description?: string }, @TenantId() tenantId: string, @Request() req: any) {
    return this.service.create(body.name, body.description, tenantId, req.user.id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: { name?: string; description?: string }, @TenantId() tenantId: string) {
    return this.service.update(id, body.name, body.description, tenantId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.service.remove(id, tenantId);
  }

  @Get(':id/contacts')
  getContacts(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.service.getContacts(id, tenantId);
  }

  @Get(':id/contacts/search')
  searchContacts(
    @Param('id') id: string,
    @TenantId() tenantId: string,
    @Query('search') search?: string,
    @Query('tagIds') tagIds?: string,
  ) {
    const tagIdArr = tagIds ? tagIds.split(',').filter(Boolean) : undefined;
    return this.service.searchContacts(id, tenantId, search, tagIdArr);
  }

  @Post(':id/contacts')
  addContacts(@Param('id') id: string, @Body() body: { contactIds: string[] }, @TenantId() tenantId: string) {
    return this.service.addContacts(id, tenantId, body.contactIds);
  }

  @Delete(':id/contacts/:contactId')
  removeContact(@Param('id') id: string, @Param('contactId') contactId: string, @TenantId() tenantId: string) {
    return this.service.removeContact(id, tenantId, contactId);
  }

  @Delete(':id/contacts')
  clearContacts(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.service.clearContacts(id, tenantId);
  }
}
