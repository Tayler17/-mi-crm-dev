import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface AutomationContext {
  tenantId: string;
  triggerEvent: string;
  conversationId?: string;
  contactId?: string;
  dealId?: string;
  taskId?: string;
  // enriched data for condition evaluation
  conversation?: Record<string, any>;
  message?: Record<string, any>;
  contact?: Record<string, any>;
  deal?: Record<string, any>;
}

@Injectable()
export class AutomationExecutorService {
  private readonly logger = new Logger(AutomationExecutorService.name);

  constructor(@InjectDataSource() private readonly db: DataSource) {}

  // ── Entry point: fire all matching rules for an event ────────────────────────

  async fireEvent(ctx: AutomationContext): Promise<void> {
    try {
      const rules = await this.db.query(
        `SELECT id, name, conditions, actions
         FROM automation_rules
         WHERE tenant_id = $1 AND trigger_event = $2 AND is_active = true`,
        [ctx.tenantId, ctx.triggerEvent],
      );

      for (const rule of rules) {
        if (this.evaluateConditions(rule.conditions ?? [], ctx)) {
          await this.runRule(rule, ctx);
        }
      }
    } catch (err) {
      this.logger.error(`fireEvent error [${ctx.triggerEvent}]: ${err}`);
    }
  }

  // ── Used by testRun in AutomationsService ────────────────────────────────────

  async runRuleById(ruleId: string, tenantId: string): Promise<{ log: string[]; errors: string[] }> {
    const [rule] = await this.db.query(
      `SELECT id, name, conditions, actions FROM automation_rules WHERE id=$1 AND tenant_id=$2`,
      [ruleId, tenantId],
    );
    if (!rule) return { log: [], errors: ['Rule not found'] };

    // Find a recent conversation to use as mock context
    const [conv] = await this.db.query(
      `SELECT id, contact_id FROM conversations WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 1`,
      [tenantId],
    );
    const ctx: AutomationContext = {
      tenantId,
      triggerEvent: rule.trigger_event ?? '',
      conversationId: conv?.id,
      contactId: conv?.contact_id,
    };
    return this.executeActions(rule.actions ?? [], ctx);
  }

  // ── Condition evaluator ──────────────────────────────────────────────────────

  private evaluateConditions(conditions: any[], ctx: AutomationContext): boolean {
    if (!conditions.length) return true;

    return conditions.every((cond) => {
      const actual = this.resolveField(cond.field, ctx);
      const expected = cond.value ?? '';

      switch (cond.operator) {
        case 'equals':      return String(actual).toLowerCase() === String(expected).toLowerCase();
        case 'not_equals':  return String(actual).toLowerCase() !== String(expected).toLowerCase();
        case 'contains':    return String(actual).toLowerCase().includes(String(expected).toLowerCase());
        case 'not_contains':return !String(actual).toLowerCase().includes(String(expected).toLowerCase());
        case 'greater_than':return parseFloat(actual) > parseFloat(expected);
        case 'less_than':   return parseFloat(actual) < parseFloat(expected);
        default:            return true;
      }
    });
  }

  private resolveField(field: string, ctx: AutomationContext): any {
    switch (field) {
      case 'conversation.channel': return ctx.conversation?.channel ?? ctx.conversation?.inbox_channel ?? '';
      case 'conversation.status':  return ctx.conversation?.status ?? '';
      case 'contact.tag':          return (ctx.contact?.tags ?? []).map((t: any) => t.name).join(',');
      case 'message.body':         return ctx.message?.body ?? '';
      case 'deal.value':           return ctx.deal?.value ?? 0;
      case 'deal.status':          return ctx.deal?.status ?? '';
      default:                     return '';
    }
  }

  // ── Rule runner: logs execution to automation_executions ────────────────────

  private async runRule(rule: { id: string; name: string; actions: any[] }, ctx: AutomationContext) {
    const [exec] = await this.db.query(
      `INSERT INTO automation_executions (tenant_id, rule_id, trigger_event, trigger_payload, status, started_at)
       VALUES ($1, $2, $3, $4, 'running', NOW()) RETURNING id`,
      [ctx.tenantId, rule.id, ctx.triggerEvent, JSON.stringify(ctx)],
    );

    const result = await this.executeActions(rule.actions, ctx);
    const status = result.errors.length === 0 ? 'completed' : 'failed';

    await this.db.query(
      `UPDATE automation_executions
       SET status=$2, result=$3, error=$4, completed_at=NOW() WHERE id=$1`,
      [exec.id, status, JSON.stringify(result), result.errors[0] ?? null],
    );

    if (result.errors.length) {
      this.logger.warn(`Rule "${rule.name}" finished with errors: ${result.errors.join(', ')}`);
    } else {
      this.logger.log(`Rule "${rule.name}" executed OK (${result.log.length} actions)`);
    }
  }

  // ── Action executor ──────────────────────────────────────────────────────────

  async executeActions(actions: any[], ctx: AutomationContext): Promise<{ log: string[]; errors: string[] }> {
    const log: string[] = [];
    const errors: string[] = [];

    for (const action of actions) {
      try {
        switch (action.type) {

          case 'assign_agent': {
            if (!ctx.conversationId || !action.agentId) break;
            await this.db.query(
              `UPDATE conversations SET assigned_to=$1, updated_at=NOW() WHERE id=$2 AND tenant_id=$3`,
              [action.agentId, ctx.conversationId, ctx.tenantId],
            );
            log.push(`✓ Agente asignado: ${action.agentId}`);
            break;
          }

          case 'assign_team': {
            if (!ctx.conversationId || !action.teamId) break;
            await this.db.query(
              `UPDATE conversations SET team_id=$1, updated_at=NOW() WHERE id=$2 AND tenant_id=$3`,
              [action.teamId, ctx.conversationId, ctx.tenantId],
            );
            log.push(`✓ Equipo asignado: ${action.teamId}`);
            break;
          }

          case 'assign_queue': {
            if (!ctx.conversationId || !action.queueId) break;
            await this.db.query(
              `UPDATE conversations SET queue_id=$1, updated_at=NOW() WHERE id=$2 AND tenant_id=$3`,
              [action.queueId, ctx.conversationId, ctx.tenantId],
            );
            log.push(`✓ Cola asignada: ${action.queueId}`);
            break;
          }

          case 'change_status': {
            if (!ctx.conversationId || !action.status) break;
            await this.db.query(
              `UPDATE conversations SET status=$1, updated_at=NOW() WHERE id=$2 AND tenant_id=$3`,
              [action.status, ctx.conversationId, ctx.tenantId],
            );
            log.push(`✓ Estado cambiado a: ${action.status}`);
            break;
          }

          case 'send_message': {
            if (!ctx.conversationId || !action.message) break;
            await this.db.query(
              `INSERT INTO messages (tenant_id, conversation_id, body, content_type, direction, sender_type, is_private, created_at, updated_at)
               VALUES ($1,$2,$3,'text','outbound','bot',false,NOW(),NOW())`,
              [ctx.tenantId, ctx.conversationId, action.message],
            );
            await this.db.query(
              `UPDATE conversations SET last_message_at=NOW(), updated_at=NOW() WHERE id=$1`,
              [ctx.conversationId],
            );
            log.push(`✓ Mensaje enviado: "${action.message}"`);
            break;
          }

          case 'add_note': {
            if (!ctx.conversationId || !action.message) break;
            await this.db.query(
              `INSERT INTO messages (tenant_id, conversation_id, body, content_type, direction, sender_type, is_private, created_at, updated_at)
               VALUES ($1,$2,$3,'text','outbound','bot',true,NOW(),NOW())`,
              [ctx.tenantId, ctx.conversationId, action.message],
            );
            log.push(`✓ Nota añadida: "${action.message}"`);
            break;
          }

          case 'add_tag': {
            if (!ctx.contactId || !action.tagName) break;
            await this.db.query(
              `INSERT INTO contact_tags (contact_id, tag_id)
               SELECT $1, id FROM tags WHERE name=$2 AND tenant_id=$3
               ON CONFLICT DO NOTHING`,
              [ctx.contactId, action.tagName, ctx.tenantId],
            );
            log.push(`✓ Tag añadido: ${action.tagName}`);
            break;
          }

          case 'remove_tag': {
            if (!ctx.contactId || !action.tagName) break;
            await this.db.query(
              `DELETE FROM contact_tags WHERE contact_id=$1
               AND tag_id=(SELECT id FROM tags WHERE name=$2 AND tenant_id=$3 LIMIT 1)`,
              [ctx.contactId, action.tagName, ctx.tenantId],
            );
            log.push(`✓ Tag removido: ${action.tagName}`);
            break;
          }

          case 'add_to_list': {
            if (!ctx.contactId || !action.listId) break;
            await this.db.query(
              `INSERT INTO contact_list_contacts (list_id, contact_id)
               VALUES ($1, $2) ON CONFLICT DO NOTHING`,
              [action.listId, ctx.contactId],
            );
            log.push(`✓ Contacto añadido a lista`);
            break;
          }

          case 'create_task': {
            if (!action.title) break;
            const dueDate = new Date();
            dueDate.setDate(dueDate.getDate() + (action.dueDays ?? 1));
            await this.db.query(
              `INSERT INTO tasks (tenant_id, title, description, status, due_date, related_type, related_id, created_at, updated_at)
               VALUES ($1,$2,'Creado por automatización','pending',$3,$4,$5,NOW(),NOW())`,
              [
                ctx.tenantId,
                action.title,
                dueDate.toISOString(),
                ctx.conversationId ? 'conversation' : ctx.contactId ? 'contact' : null,
                ctx.conversationId ?? ctx.contactId ?? null,
              ],
            );
            log.push(`✓ Tarea creada: "${action.title}"`);
            break;
          }

          case 'webhook': {
            if (!action.url) break;
            const body = JSON.stringify({ event: ctx.triggerEvent, ...ctx });
            // Node 18+ has native fetch
            const res = await (globalThis as any).fetch(action.url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body,
              signal: AbortSignal.timeout(5000),
            }).catch((e: any) => ({ ok: false, status: 0, statusText: e.message }));
            if ((res as any).ok) {
              log.push(`✓ Webhook enviado a ${action.url}`);
            } else {
              errors.push(`Webhook falló ${action.url}: ${(res as any).status} ${(res as any).statusText}`);
            }
            break;
          }

          case 'wait': {
            // Async wait not implemented in-process; log and continue
            log.push(`⏱ Espera de ${action.minutes ?? 0} min (procesamiento asíncrono pendiente)`);
            break;
          }

          case 'update_deal': {
            if (!ctx.dealId) break;
            log.push(`✓ Deal actualizado (pendiente conectar campo)`);
            break;
          }

          default:
            errors.push(`Acción desconocida: ${action.type}`);
        }
      } catch (e: any) {
        errors.push(`Error en acción "${action.type}": ${e.message}`);
      }
    }

    return { log, errors };
  }
}
