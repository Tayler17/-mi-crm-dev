import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

interface FlowStep {
  id: string;
  type: 'message' | 'menu' | 'input' | 'condition' | 'assign' | 'tag' | 'wait' | 'end';
  label?: string;
  text?: string;
  nextStepId?: string;
  // menu
  options?: Array<{ label: string; nextStepId: string }>;
  // input
  saveAs?: string;
  // condition
  field?: string;
  operator?: string;
  value?: string;
  trueStepId?: string;
  falseStepId?: string;
  // assign
  assignTo?: 'queue' | 'team' | 'agent';
  assignId?: string;
  // tag
  tagName?: string;
  // wait
  seconds?: number;
}

interface Session {
  id: string;
  flow_id: string;
  conversation_id: string;
  contact_id: string;
  tenant_id: string;
  variables: Record<string, any>;
  status: string;
}

@Injectable()
export class FlowRunnerService {
  private readonly logger = new Logger(FlowRunnerService.name);

  constructor(@InjectDataSource() private readonly db: DataSource) {}

  // ── Start a new session ───────────────────────────────────────────────────────

  async startSession(
    tenantId: string,
    flowId: string,
    conversationId: string,
    contactId: string,
    triggerMessage?: string,
  ): Promise<void> {
    // Only one active session per conversation
    const existing = await this.db.query(
      `SELECT id FROM flow_sessions WHERE conversation_id=$1 AND status='active' LIMIT 1`,
      [conversationId],
    );
    if (existing.length) return;

    const [session] = await this.db.query(
      `INSERT INTO flow_sessions (tenant_id, flow_id, conversation_id, contact_id, current_step, variables, status, started_at, updated_at)
       VALUES ($1,$2,$3,$4,0,'{}','active',NOW(),NOW()) RETURNING *`,
      [tenantId, flowId, conversationId, contactId],
    );

    const steps = await this.getFlowSteps(flowId);
    if (!steps.length) {
      await this.completeSession(session.id);
      return;
    }

    await this.runStep(session, steps, steps[0], triggerMessage);
  }

  // ── Continue session on inbound message ──────────────────────────────────────

  async continueSession(
    conversationId: string,
    tenantId: string,
    messageBody: string,
  ): Promise<void> {
    const [session] = await this.db.query(
      `SELECT * FROM flow_sessions WHERE conversation_id=$1 AND status='active' LIMIT 1`,
      [conversationId],
    );
    if (!session) return;

    const steps = await this.getFlowSteps(session.flow_id);
    if (!steps.length) { await this.completeSession(session.id); return; }

    // Get the waiting step from variables
    const currentStepId: string | undefined = session.variables?._waiting_step_id;
    if (!currentStepId) return; // not waiting for input

    const currentStep = steps.find((s: FlowStep) => s.id === currentStepId);
    if (!currentStep) { await this.completeSession(session.id); return; }

    let nextStepId: string | undefined;

    if (currentStep.type === 'menu') {
      // Match by number or text
      const opts = currentStep.options ?? [];
      const idx = parseInt(messageBody.trim(), 10) - 1;
      const matched = (!isNaN(idx) && opts[idx])
        ? opts[idx]
        : opts.find((o: any) => o.label.toLowerCase() === messageBody.trim().toLowerCase());
      nextStepId = matched?.nextStepId;
      if (!nextStepId) {
        // Invalid selection — resend menu
        await this.sendMessage(session.conversation_id, session.tenant_id,
          `Opción no válida. ${currentStep.text ?? ''}\n${opts.map((o: any, i: number) => `${i + 1}. ${o.label}`).join('\n')}`);
        return;
      }
    } else if (currentStep.type === 'input') {
      // Save response to variable
      const varName = currentStep.saveAs ?? 'respuesta';
      const newVars = { ...session.variables, [varName]: messageBody.trim() };
      delete newVars._waiting_step_id;
      await this.updateSessionVars(session.id, newVars);
      session.variables = newVars;
      nextStepId = currentStep.nextStepId;
    }

    if (!nextStepId || nextStepId === '__end__') {
      await this.completeSession(session.id);
      return;
    }

    const nextStep = steps.find((s: FlowStep) => s.id === nextStepId);
    if (!nextStep) { await this.completeSession(session.id); return; }

    // Clear waiting flag before running next step
    const clearedVars = { ...session.variables };
    delete clearedVars._waiting_step_id;
    await this.updateSessionVars(session.id, clearedVars);
    session.variables = clearedVars;

    await this.runStep(session, steps, nextStep, messageBody);
  }

  // ── Execute a single step ─────────────────────────────────────────────────────

  private async runStep(
    session: Session,
    allSteps: FlowStep[],
    step: FlowStep,
    userInput?: string,
    depth = 0,
  ): Promise<void> {
    if (depth > 20) { await this.completeSession(session.id); return; } // cycle guard

    this.logger.debug(`Flow session ${session.id} → step ${step.id} (${step.type})`);

    switch (step.type) {

      case 'message': {
        const text = this.interpolate(step.text ?? '', session.variables);
        await this.sendMessage(session.conversation_id, session.tenant_id, text);
        const next = step.nextStepId ? allSteps.find((s) => s.id === step.nextStepId) : undefined;
        if (!next || step.nextStepId === '__end__') { await this.completeSession(session.id); return; }
        await this.runStep(session, allSteps, next, undefined, depth + 1);
        break;
      }

      case 'menu': {
        const opts = step.options ?? [];
        const menuText = `${this.interpolate(step.text ?? '¿Cómo podemos ayudarte?', session.variables)}\n${opts.map((o, i) => `${i + 1}. ${o.label}`).join('\n')}`;
        await this.sendMessage(session.conversation_id, session.tenant_id, menuText);
        // Set waiting flag
        await this.updateSessionVars(session.id, { ...session.variables, _waiting_step_id: step.id });
        break;
      }

      case 'input': {
        const question = this.interpolate(step.text ?? '', session.variables);
        await this.sendMessage(session.conversation_id, session.tenant_id, question);
        await this.updateSessionVars(session.id, { ...session.variables, _waiting_step_id: step.id });
        break;
      }

      case 'condition': {
        const actual = this.resolveVar(step.field ?? '', session.variables, userInput);
        const expected = step.value ?? '';
        const result = this.evaluateCondition(actual, step.operator ?? 'contains', expected);
        const nextId = result ? step.trueStepId : step.falseStepId;
        if (!nextId || nextId === '__end__') { await this.completeSession(session.id); return; }
        const next = allSteps.find((s) => s.id === nextId);
        if (!next) { await this.completeSession(session.id); return; }
        await this.runStep(session, allSteps, next, userInput, depth + 1);
        break;
      }

      case 'assign': {
        if (step.assignId) {
          const col = step.assignTo === 'queue' ? 'queue_id' : step.assignTo === 'team' ? 'team_id' : 'assigned_to';
          await this.db.query(
            `UPDATE conversations SET ${col}=$1, updated_at=NOW() WHERE id=$2 AND tenant_id=$3`,
            [step.assignId, session.conversation_id, session.tenant_id],
          );
        }
        const next = step.nextStepId ? allSteps.find((s) => s.id === step.nextStepId) : undefined;
        if (!next || step.nextStepId === '__end__') { await this.completeSession(session.id); return; }
        await this.runStep(session, allSteps, next, userInput, depth + 1);
        break;
      }

      case 'tag': {
        if (step.tagName && session.contact_id) {
          await this.db.query(
            `INSERT INTO contact_tags (contact_id, tag_id)
             SELECT $1, id FROM tags WHERE name=$2 AND tenant_id=$3
             ON CONFLICT DO NOTHING`,
            [session.contact_id, step.tagName, session.tenant_id],
          );
        }
        const next = step.nextStepId ? allSteps.find((s) => s.id === step.nextStepId) : undefined;
        if (!next || step.nextStepId === '__end__') { await this.completeSession(session.id); return; }
        await this.runStep(session, allSteps, next, userInput, depth + 1);
        break;
      }

      case 'wait': {
        // Immediate continuation (no true async wait in-process)
        const next = step.nextStepId ? allSteps.find((s) => s.id === step.nextStepId) : undefined;
        if (!next || step.nextStepId === '__end__') { await this.completeSession(session.id); return; }
        await this.runStep(session, allSteps, next, userInput, depth + 1);
        break;
      }

      case 'end': {
        if (step.text) {
          await this.sendMessage(session.conversation_id, session.tenant_id,
            this.interpolate(step.text, session.variables));
        }
        await this.completeSession(session.id);
        break;
      }
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  private async getFlowSteps(flowId: string): Promise<FlowStep[]> {
    const [flow] = await this.db.query(`SELECT steps FROM conversation_flows WHERE id=$1`, [flowId]);
    return (flow?.steps ?? []) as FlowStep[];
  }

  private async sendMessage(conversationId: string, tenantId: string, body: string) {
    await this.db.query(
      `INSERT INTO messages (tenant_id, conversation_id, body, content_type, direction, sender_type, is_private, created_at, updated_at)
       VALUES ($1,$2,$3,'text','outbound','bot',false,NOW(),NOW())`,
      [tenantId, conversationId, body],
    );
    await this.db.query(
      `UPDATE conversations SET last_message_at=NOW(), updated_at=NOW() WHERE id=$1`,
      [conversationId],
    );
  }

  private async updateSessionVars(sessionId: string, vars: Record<string, any>) {
    await this.db.query(
      `UPDATE flow_sessions SET variables=$1, updated_at=NOW() WHERE id=$2`,
      [JSON.stringify(vars), sessionId],
    );
  }

  private async completeSession(sessionId: string) {
    await this.db.query(
      `UPDATE flow_sessions SET status='completed', updated_at=NOW() WHERE id=$1`,
      [sessionId],
    );
  }

  private interpolate(text: string, vars: Record<string, any>): string {
    return text.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
  }

  private resolveVar(field: string, vars: Record<string, any>, lastMessage?: string): string {
    if (field.startsWith('saved.')) return vars[field.slice(6)] ?? '';
    if (field === 'message.body') return lastMessage ?? '';
    if (field === 'contact.tag') return vars._tags ?? '';
    return '';
  }

  private evaluateCondition(actual: string, operator: string, expected: string): boolean {
    const a = actual.toLowerCase(), e = expected.toLowerCase();
    switch (operator) {
      case 'contains':    return a.includes(e);
      case 'equals':      return a === e;
      case 'not_equals':  return a !== e;
      case 'starts_with': return a.startsWith(e);
      default:            return false;
    }
  }
}
