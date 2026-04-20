import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { AutomationRule } from './automation-rule.entity';
import { AutomationExecutorService } from './automation-executor.service';

@Injectable()
export class AutomationsService {
  constructor(
    @InjectRepository(AutomationRule) private readonly repo: Repository<AutomationRule>,
    @InjectDataSource() private readonly db: DataSource,
    private readonly executor: AutomationExecutorService,
  ) {}

  async findAll(tenantId: string) {
    const rows = await this.db.query(
      `SELECT r.*,
              u.full_name AS created_by_name,
              COUNT(e.id) FILTER (WHERE e.status = 'completed')::int AS executions_ok,
              COUNT(e.id) FILTER (WHERE e.status = 'failed')::int AS executions_failed,
              MAX(e.created_at) AS last_executed_at
       FROM automation_rules r
       LEFT JOIN users u ON u.id = r.created_by
       LEFT JOIN automation_executions e ON e.rule_id = r.id
       WHERE r.tenant_id = $1
       GROUP BY r.id, u.full_name
       ORDER BY r.created_at DESC`,
      [tenantId],
    );
    return rows;
  }

  async findOne(id: string, tenantId: string) {
    const rule = await this.repo.findOne({ where: { id, tenantId } });
    if (!rule) throw new NotFoundException('Automation rule not found');
    return rule;
  }

  async create(dto: any, tenantId: string, userId: string) {
    const rule = this.repo.create({
      tenantId,
      name: dto.name,
      triggerEvent: dto.triggerEvent,
      conditions: dto.conditions ?? [],
      actions: dto.actions ?? [],
      isActive: dto.isActive ?? true,
      createdBy: userId,
    });
    return this.repo.save(rule);
  }

  async update(id: string, dto: any, tenantId: string) {
    const rule = await this.findOne(id, tenantId);
    Object.assign(rule, {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.triggerEvent !== undefined && { triggerEvent: dto.triggerEvent }),
      ...(dto.conditions !== undefined && { conditions: dto.conditions }),
      ...(dto.actions !== undefined && { actions: dto.actions }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
    });
    return this.repo.save(rule);
  }

  async remove(id: string, tenantId: string) {
    const rule = await this.findOne(id, tenantId);
    await this.repo.remove(rule);
  }

  async toggleActive(id: string, tenantId: string) {
    const rule = await this.findOne(id, tenantId);
    rule.isActive = !rule.isActive;
    await this.repo.save(rule);
    return { id, isActive: rule.isActive };
  }

  // ── Executions log ────────────────────────────────────────────────────────────

  async getExecutions(ruleId: string, tenantId: string) {
    await this.findOne(ruleId, tenantId);
    return this.db.query(
      `SELECT id, trigger_event, status, result, error, started_at, completed_at, created_at
       FROM automation_executions
       WHERE rule_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [ruleId],
    );
  }

  // ── Manual trigger (test run) — uses real executor ───────────────────────────

  async testRun(id: string, tenantId: string) {
    const result = await this.executor.runRuleById(id, tenantId);
    return { ok: result.errors.length === 0, result };
  }
}
