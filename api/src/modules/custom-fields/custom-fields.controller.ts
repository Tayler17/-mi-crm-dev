import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { TenantId } from '../../common/decorators/tenant.decorator';

const ALLOWED_ENTITY_TYPES = ['contact', 'deal', 'conversation'];
const ALLOWED_FIELD_TYPES   = ['text', 'number', 'date', 'select', 'checkbox', 'url', 'textarea'];

@Controller('custom-fields')
@UseGuards(JwtAuthGuard)
export class CustomFieldsController {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  // ── Definition CRUD (admin only) ─────────────────────────────────────────

  @Get('definitions')
  getDefinitions(@TenantId() tenantId: string, @Query('entityType') entityType?: string) {
    const where = entityType && ALLOWED_ENTITY_TYPES.includes(entityType)
      ? `AND entity_type=$2`
      : '';
    const params: any[] = [tenantId];
    if (where) params.push(entityType);
    return this.db.query(
      `SELECT * FROM custom_field_definitions WHERE tenant_id=$1 ${where} ORDER BY entity_type, position, created_at`,
      params,
    );
  }

  @Post('definitions')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async createDefinition(
    @TenantId() tenantId: string,
    @Body() body: { entityType: string; name: string; label: string; fieldType?: string; options?: string[]; isRequired?: boolean; position?: number },
  ) {
    if (!ALLOWED_ENTITY_TYPES.includes(body.entityType)) throw new Error('Invalid entity type');
    const fieldType = ALLOWED_FIELD_TYPES.includes(body.fieldType ?? '') ? body.fieldType : 'text';
    const [row] = await this.db.query(
      `INSERT INTO custom_field_definitions (tenant_id, entity_type, name, label, field_type, options, is_required, position)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [tenantId, body.entityType, body.name, body.label, fieldType,
       body.options ? JSON.stringify(body.options) : null,
       body.isRequired ?? false, body.position ?? 0],
    );
    return row;
  }

  @Patch('definitions/:id')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async updateDefinition(
    @Param('id') id: string,
    @TenantId() tenantId: string,
    @Body() body: Partial<{ label: string; options: string[]; isRequired: boolean; position: number }>,
  ) {
    const sets: string[] = [];
    const vals: any[]    = [id, tenantId];
    let i = 2;
    if (body.label     !== undefined) { sets.push(`label=$${++i}`);       vals.push(body.label); }
    if (body.options   !== undefined) { sets.push(`options=$${++i}`);     vals.push(JSON.stringify(body.options)); }
    if (body.isRequired!== undefined) { sets.push(`is_required=$${++i}`); vals.push(body.isRequired); }
    if (body.position  !== undefined) { sets.push(`position=$${++i}`);    vals.push(body.position); }
    if (!sets.length) return { ok: true };
    const [row] = await this.db.query(
      `UPDATE custom_field_definitions SET ${sets.join(',')} WHERE id=$1 AND tenant_id=$2 RETURNING *`,
      vals,
    );
    return row ?? null;
  }

  @Delete('definitions/:id')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async deleteDefinition(@Param('id') id: string, @TenantId() tenantId: string) {
    await this.db.query(`DELETE FROM custom_field_definitions WHERE id=$1 AND tenant_id=$2`, [id, tenantId]);
    return { ok: true };
  }

  // ── Values ────────────────────────────────────────────────────────────────

  @Get('values/:entityType/:entityId')
  async getValues(
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
    @TenantId() tenantId: string,
  ) {
    return this.db.query(
      `SELECT cf.id AS definition_id, cf.name, cf.label, cf.field_type, cf.options, cf.is_required, cf.position,
              cv.id AS value_id, cv.value
       FROM custom_field_definitions cf
       LEFT JOIN custom_field_values cv ON cv.definition_id=cf.id AND cv.entity_id=$3
       WHERE cf.tenant_id=$1 AND cf.entity_type=$2
       ORDER BY cf.position, cf.created_at`,
      [tenantId, entityType, entityId],
    );
  }

  @Post('values/:entityType/:entityId')
  async setValues(
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
    @TenantId() tenantId: string,
    @Body() body: { values: { definitionId: string; value: string | null }[] },
  ) {
    for (const { definitionId, value } of body.values ?? []) {
      if (value === null || value === '') {
        await this.db.query(
          `DELETE FROM custom_field_values WHERE definition_id=$1 AND entity_id=$2`,
          [definitionId, entityId],
        ).catch(() => {});
      } else {
        await this.db.query(
          `INSERT INTO custom_field_values (tenant_id, definition_id, entity_id, entity_type, value, updated_at)
           VALUES ($1,$2,$3,$4,$5,NOW())
           ON CONFLICT (definition_id, entity_id) DO UPDATE SET value=$5, updated_at=NOW()`,
          [tenantId, definitionId, entityId, entityType, String(value).slice(0, 2000)],
        );
      }
    }
    return { ok: true };
  }
}
