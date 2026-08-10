import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PlatformSettingsService } from '../settings/platform-settings.service';
import { CRM_TOOLS, toOpenAITools, runTool } from '../ai-chatbots/crm-tools';

const SYSTEM_PROMPT = `Eres el "Asistente de Negocio AI", integrado en el CRM AutoMarkIQ.
Ayudas al equipo de la empresa a GESTIONAR su CRM usando las herramientas disponibles
(buscar/crear contactos, resúmenes, y más que se irán agregando).

Reglas:
- Responde en español, claro y breve.
- Cuando necesites datos del CRM, USA una herramienta — nunca inventes datos, números ni resultados.
- Solo operas sobre los datos de ESTA empresa (el sistema ya te aísla por cuenta).
- **Acciones sensibles** (borrar, lanzar campañas, publicar, o cualquiera marcada como destructiva): NUNCA las ejecutes de golpe. Primero **describe exactamente qué vas a hacer y pide confirmación** ("¿Confirmas que…?"). Solo cuando el usuario diga que sí de forma explícita, vuelve a llamar la herramienta con confirm=true. Si una herramienta responde needs_confirmation, es que faltó ese paso: pregunta y reintenta con confirm=true tras el "sí".
- Nunca manejes credenciales, tokens ni datos de pago — eso se hace desde la interfaz, no por ti.
- Si una herramienta falla o no existe, dilo con honestidad; no simules el resultado.`;

interface ChatMessage { role: 'user' | 'assistant' | 'system' | 'tool'; content: string; [k: string]: any }

@Injectable()
export class AiAgentService implements OnModuleInit {
  private readonly logger = new Logger(AiAgentService.name);

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly platformSettings: PlatformSettingsService,
  ) {}

  async onModuleInit() {
    // Per-plan Business Assistant toggle + monthly token budget, and a usage meter.
    // Default enabled=true / limit=0 (unlimited) so existing tenants aren't cut off.
    await this.db.query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS has_business_assistant boolean NOT NULL DEFAULT true`).catch(() => {});
    await this.db.query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS max_assistant_tokens integer NOT NULL DEFAULT 0`).catch(() => {});
    await this.db.query(
      `CREATE TABLE IF NOT EXISTS ai_agent_usage (
         tenant_id text NOT NULL, period text NOT NULL,
         tokens bigint NOT NULL DEFAULT 0,
         PRIMARY KEY (tenant_id, period))`,
    ).catch(() => {});
  }

  private period(): string { return new Date().toISOString().slice(0, 7); } // YYYY-MM

  /** Check the tenant's plan allows the assistant and hasn't blown its monthly token budget. */
  private async checkAccess(tenantId: string): Promise<{ ok: boolean; error?: string }> {
    const [row] = await this.db.query(
      `SELECT COALESCE(p.has_business_assistant, true) AS enabled,
              COALESCE(p.max_assistant_tokens, 0)     AS max_tokens,
              COALESCE(p.allow_overage, false)        AS overage
       FROM tenants t LEFT JOIN plans p ON p.id = t.plan_id WHERE t.id::text = $1`,
      [tenantId],
    );
    if (row && row.enabled === false) {
      return { ok: false, error: 'El Asistente de Negocio no está incluido en tu plan. Actualiza tu plan para usarlo.' };
    }
    const max = Number(row?.max_tokens ?? 0);
    if (max > 0 && !row?.overage) {
      const [u] = await this.db.query(`SELECT tokens FROM ai_agent_usage WHERE tenant_id::text=$1 AND period=$2`, [tenantId, this.period()]);
      if (u && Number(u.tokens) >= max) {
        return { ok: false, error: `Alcanzaste el límite mensual del Asistente (${max.toLocaleString()} tokens). Actualiza tu plan para seguir usándolo.` };
      }
    }
    return { ok: true };
  }

  private async addUsage(tenantId: string, tokens: number) {
    if (!tokens || tokens < 0) return;
    await this.db.query(
      `INSERT INTO ai_agent_usage (tenant_id, period, tokens) VALUES ($1,$2,$3)
       ON CONFLICT (tenant_id, period) DO UPDATE SET tokens = ai_agent_usage.tokens + EXCLUDED.tokens`,
      [tenantId, this.period(), Math.round(tokens)],
    ).catch(() => {});
  }

  /** Run one agent turn: LLM + tool-calling loop over the central CRM tool registry. */
  async chat(tenantId: string, role: string | undefined, history: ChatMessage[]) {
    const { apiKey, model } = await this.platformSettings.getAI();
    if (!apiKey) return { ok: false, error: 'No hay una API key de IA configurada en la plataforma (Ajustes → IA).', reply: '', actions: [] };

    // Plan gate: assistant enabled + monthly token budget not exceeded.
    const gate = await this.checkAccess(tenantId);
    if (!gate.ok) return { ok: false, error: gate.error, reply: '', actions: [] };

    const ctx = { db: this.db, tenantId, role };
    const tools = toOpenAITools(CRM_TOOLS);

    // Keep only user/assistant turns from the client; we add the system prompt ourselves.
    const convo: any[] = [{ role: 'system', content: SYSTEM_PROMPT }];
    for (const m of history.slice(-20)) {
      if (m.role === 'user' || m.role === 'assistant') convo.push({ role: m.role, content: String(m.content ?? '') });
    }

    const actions: { tool: string; args: any; result: any }[] = [];
    try {
      for (let step = 0; step < 6; step++) {
        const res = await (globalThis as any).fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: model || 'gpt-4o', messages: convo, tools, temperature: 0.2 }),
          signal: AbortSignal.timeout(45000),
        });
        const data: any = await res.json();
        await this.addUsage(tenantId, data?.usage?.total_tokens ?? 0); // meter tokens per tenant/month
        if (data?.error) return { ok: false, error: `IA: ${data.error.message}`, reply: '', actions };
        const msg = data?.choices?.[0]?.message;
        if (!msg) return { ok: false, error: 'La IA no devolvió respuesta.', reply: '', actions };
        convo.push(msg);

        if (Array.isArray(msg.tool_calls) && msg.tool_calls.length) {
          for (const tc of msg.tool_calls) {
            let args: any = {};
            try { args = JSON.parse(tc.function?.arguments || '{}'); } catch {}
            const result = await runTool(CRM_TOOLS, tc.function?.name, ctx, args);
            actions.push({ tool: tc.function?.name, args, result });
            convo.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result).slice(0, 4000) });
          }
          continue; // let the model read the tool results and continue
        }
        return { ok: true, reply: msg.content ?? '', actions };
      }
      return { ok: true, reply: 'Hice varias acciones seguidas; dime si quieres que continúe.', actions };
    } catch (e: any) {
      this.logger.warn(`[ai-agent] chat failed for tenant ${tenantId}: ${e.message}`);
      return { ok: false, error: e.message, reply: '', actions };
    }
  }
}
