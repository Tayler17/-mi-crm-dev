/**
 * Provider-agnostic definitions of the CUSTOMER-FACING chatbot tools.
 *
 * These are a different model from the central `crm-tools.ts` registry: instead
 * of executing directly in a multi-step loop, each tool carries a `message`
 * (the reply shown to the customer) and maps to a single "intent" that the
 * engine applies afterwards (create deal, transfer, book appointment, …).
 *
 * Single source of truth: the engine calls `buildChatbotTools(ctx)` once per
 * turn — passing runtime context (pipeline stages, the contact's open deals,
 * available tags, feature flags) — then converts the neutral list to the shape
 * each LLM provider expects. Previously these tools were declared three times
 * (OpenAI / Anthropic / Gemini) and had drifted apart (e.g. the patient
 * name/phone/email fields for Dentally booking existed only in the OpenAI copy,
 * and the Dentally tools were accidentally nested inside the Stripe-Connect
 * gate for Anthropic/Gemini). Defining them once removes that whole class of bug.
 */

export interface ChatbotToolContext {
  /** Queue/bot names this conversation can be transferred to. Empty → no transfer tool. */
  transferTargets: string[];
  /** Pipeline stage names. Empty → no deal tools. */
  stageNames: string[];
  /** The contact's currently open deals. Empty → no update_deal tool. */
  existingDeals: Array<{ id: string; title: string; stage_name?: string }>;
  /** Tag names available for this tenant. Empty → no tag tools. */
  tagNames: string[];
  /** Stripe Connect enabled → expose create_payment_link. */
  stripeConnectEnabled: boolean;
  /** Dentally integration connected → expose the dentally_* tools. */
  dentallyConnected: boolean;
  /** Tenant's custom field definitions for contacts → exposed inside update_contact. */
  contactFields?: Array<{ id: string; name: string; label?: string; fieldType?: string; options?: any }>;
}

/** JSON-Schema-ish neutral parameter shape (lowercase types, like OpenAI/Anthropic). */
interface NeutralSchema {
  type: 'object';
  properties: Record<string, any>;
  required?: string[];
}

export interface NeutralTool {
  name: string;
  description: string;
  parameters: NeutralSchema;
}

/** The engine's per-turn intent (structurally identical to the engine's AiResult). */
export interface ChatbotToolIntent {
  reply: string;
  transferTo?: string;
  resolveConversation?: boolean;
  setWaiting?: boolean;
  createDeal?: { title: string; value?: number; currency?: string; stageName?: string; notes?: string };
  updateDeal?: { dealId: string; stageName?: string; value?: number; notes?: string; status?: string };
  addTag?: { tagName: string };
  removeTag?: { tagName: string };
  createTask?: { title: string; description?: string; dueDate?: string; priority?: string };
  updateContact?: { fullName?: string; phone?: string; email?: string; jobTitle?: string; notes?: string; customFields?: Record<string, any> };
  createPaymentLink?: { amount: number; currency: string; description: string };
  dentallyListPractitioners?: boolean;
  dentallyCheckAvailability?: { date: string; practitionerName?: string; durationMinutes?: number };
  dentallyBook?: {
    date: string; time: string; practitionerName?: string; durationMinutes?: number; reason?: string;
    name?: string; phone?: string; email?: string; dateOfBirth?: string; gender?: string; title?: string;
  };
  dentallyGetAppointments?: boolean;
}

/** Normalize a custom field's `options` (jsonb: string[] or {value/label}[]) to a string[] enum. */
function normalizeOptions(options: any): string[] {
  if (!Array.isArray(options)) return [];
  return options
    .map((o) => (typeof o === 'string' ? o : (o?.value ?? o?.label ?? '')))
    .filter((v) => typeof v === 'string' && v.length > 0);
}

/**
 * Build the tool list for a turn, gated by what the tenant/conversation supports.
 * The gating here is the single, correct version — no accidental nesting.
 */
export function buildChatbotTools(ctx: ChatbotToolContext): NeutralTool[] {
  const tools: NeutralTool[] = [];

  if (ctx.transferTargets.length > 0) {
    tools.push({
      name: 'transfer_conversation',
      description: 'Transfer this conversation to another specialized team or bot. Call this ONLY when the user explicitly requests transfer or clearly needs a service you cannot handle. The "message" field is a short friendly message sent DIRECTLY TO THE CUSTOMER (e.g. "Un momento, te conecto con el equipo de reservas ✓"). NEVER write internal phrases like "el cliente ha pedido ser transferido" — always address the customer directly in second person.',
      parameters: {
        type: 'object',
        properties: {
          destination: { type: 'string', enum: ctx.transferTargets, description: 'The destination team/bot name' },
          message: { type: 'string', description: 'Short friendly message TO THE CUSTOMER confirming the transfer (e.g. "Un momento, te conecto con el equipo de reservas ✓"). Write directly to the customer, never use internal language.' },
        },
        required: ['destination', 'message'],
      },
    });
  }

  tools.push({
    name: 'resolve_conversation',
    description: "Mark this conversation as resolved when the customer's request has been fully addressed.",
    parameters: { type: 'object', properties: { message: { type: 'string', description: 'Final message to the customer before closing' } }, required: ['message'] },
  });

  tools.push({
    name: 'set_waiting',
    description: 'Put conversation on hold when more information is needed or you cannot proceed right now.',
    parameters: { type: 'object', properties: { message: { type: 'string', description: 'Message explaining the wait' } }, required: ['message'] },
  });

  // update_contact — always available. Updates THIS customer's own contact record.
  // The contact is resolved from the conversation, so no id is passed by the model.
  {
    const properties: Record<string, any> = {
      full_name: { type: 'string', description: "The customer's full name" },
      phone: { type: 'string', description: "The customer's phone number, with country code" },
      email: { type: 'string', description: "The customer's email address" },
      job_title: { type: 'string', description: 'Job title / role, if the customer mentions it' },
      notes: { type: 'string', description: 'A free-form note to save on the contact (replaces existing notes)' },
    };
    let customFieldsHint = '';
    if (ctx.contactFields && ctx.contactFields.length > 0) {
      const cfProps: Record<string, any> = {};
      for (const f of ctx.contactFields) {
        const prop: any = { type: 'string', description: f.label || f.name };
        const opts = normalizeOptions(f.options);
        if ((f.fieldType === 'select' || f.fieldType === 'dropdown') && opts.length) prop.enum = opts;
        cfProps[f.name] = prop;
      }
      properties.custom_fields = { type: 'object', description: 'Additional custom fields for this contact. Only include a field when the customer gives its value.', properties: cfProps };
      customFieldsHint = ` Custom fields you may also set: ${ctx.contactFields.map((f) => f.label || f.name).join(', ')}.`;
    }
    properties.message = { type: 'string', description: 'Short friendly confirmation to the customer' };
    tools.push({
      name: 'update_contact',
      description: `Save or correct THIS customer's own contact details in the CRM (name, phone, email, job title, notes${ctx.contactFields && ctx.contactFields.length ? ', custom fields' : ''}). Use when the customer provides or corrects their own information. Only include the fields the customer actually gave you — leave the rest out.${customFieldsHint}`,
      parameters: { type: 'object', properties, required: ['message'] },
    });
  }

  if (ctx.stageNames.length > 0) {
    tools.push({
      name: 'create_deal',
      description: 'Create a new deal/booking in the CRM for this customer. Use only when the customer requests a NEW service or product distinct from existing open deals.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Deal title (e.g. "Envío LDN→SDQ - Taylor Cabrera")' },
          value: { type: 'number', description: 'Deal value' },
          currency: { type: 'string', description: 'Currency (USD/GBP/EUR)', default: 'USD' },
          stage_name: { type: 'string', enum: ctx.stageNames, description: 'Pipeline stage' },
          notes: { type: 'string', description: 'Additional notes' },
          message: { type: 'string', description: 'Confirmation message to customer' },
        },
        required: ['title', 'stage_name', 'message'],
      },
    });

    if (ctx.existingDeals.length > 0) {
      const dealIds = ctx.existingDeals.map((d) => d.id);
      tools.push({
        name: 'update_deal',
        description: `Update an existing open deal. Use this when the customer is following up on an existing deal. Open deals: ${ctx.existingDeals.map((d) => `"${d.title}"(id:${d.id},stage:${d.stage_name ?? 'none'})`).join(', ')}`,
        parameters: {
          type: 'object',
          properties: {
            deal_id: { type: 'string', enum: dealIds, description: 'Deal ID to update' },
            stage_name: { type: 'string', enum: ctx.stageNames, description: 'New stage' },
            value: { type: 'number', description: 'New value' },
            notes: { type: 'string', description: 'Updated notes' },
            status: { type: 'string', enum: ['open', 'won', 'lost'], description: 'Deal status' },
            message: { type: 'string', description: 'Message to customer' },
          },
          required: ['deal_id', 'message'],
        },
      });
    }
  }

  if (ctx.tagNames.length > 0) {
    tools.push({
      name: 'add_tag',
      description: 'Add a tag/label to this contact and conversation. Use when the conversation reveals information that should classify this contact (e.g. "Interesado", "VIP", "Reclamación").',
      parameters: {
        type: 'object',
        properties: {
          tag_name: { type: 'string', enum: ctx.tagNames, description: 'Tag to add' },
          message: { type: 'string', description: 'Optional short message to the customer (leave empty string if no message needed)' },
        },
        required: ['tag_name', 'message'],
      },
    });
    tools.push({
      name: 'remove_tag',
      description: 'Remove a tag/label from this contact and conversation.',
      parameters: {
        type: 'object',
        properties: {
          tag_name: { type: 'string', enum: ctx.tagNames, description: 'Tag to remove' },
          message: { type: 'string', description: 'Optional short message to the customer (leave empty string if no message needed)' },
        },
        required: ['tag_name', 'message'],
      },
    });
  }

  tools.push({
    name: 'create_task',
    description: 'Create a follow-up task linked to this contact. Use when the customer requests a callback, a quote, or any pending action that must be tracked.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short task title (e.g. "Llamar a María el lunes", "Enviar cotización")' },
        description: { type: 'string', description: 'Additional details (optional)' },
        due_date: { type: 'string', description: 'ISO 8601 date string for the deadline (optional, e.g. "2026-05-01")' },
        priority: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Task priority (default: medium)' },
        message: { type: 'string', description: 'Confirmation message to the customer' },
      },
      required: ['title', 'message'],
    },
  });

  if (ctx.stripeConnectEnabled) {
    tools.push({
      name: 'create_payment_link',
      description: 'Generate a Stripe payment link to send to the customer. RULES: 1) ONLY call after the customer explicitly confirms they want to pay AND you have confirmed the exact amount. 2) Always ask "¿Confirmas el pago de $X [currency]?" BEFORE calling this. 3) Amount: min $1, max $10,000. 4) The link will be sent automatically after generation.',
      parameters: {
        type: 'object',
        properties: {
          amount: { type: 'number', description: 'Amount to charge (e.g. 150.00). Must be between 1 and 10000.' },
          currency: { type: 'string', description: 'Currency code: USD, EUR, GBP, MXN, etc.', default: 'USD' },
          description: { type: 'string', description: 'Description visible to the customer on the payment page (e.g. "Consulta médica - 1 hora")' },
          message: { type: 'string', description: 'Message to send to the customer confirming the payment link is being sent' },
        },
        required: ['amount', 'currency', 'description', 'message'],
      },
    });
  }

  if (ctx.dentallyConnected) {
    tools.push({
      name: 'dentally_list_practitioners',
      description: 'List the clinic professionals/doctors available for appointments.',
      parameters: { type: 'object', properties: { message: { type: 'string', description: 'Optional short message to the customer' } } },
    });
    tools.push({
      name: 'dentally_check_availability',
      description: 'Check open appointment slots. If the requested day has no slots, it AUTOMATICALLY returns the soonest available day, so never ask the customer to try dates one by one. For "the soonest/earliest available" requests, pass today as the date. Use when the customer asks about availability or times.',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'Day to check, format YYYY-MM-DD' },
          practitioner_name: { type: 'string', description: 'Optional professional name' },
          duration: { type: 'number', description: 'Minutes (default 30)' },
        },
        required: ['date'],
      },
    });
    tools.push({
      name: 'dentally_book_appointment',
      description: "Book an appointment once the customer has chosen a day and time. ALWAYS pass the patient's own name (and phone/email if the customer gave them) — these identify the patient in the clinic system, do NOT rely on the caller's phone number. If the customer is NOT a registered patient, also ask for date_of_birth (YYYY-MM-DD) and gender (male/female) before calling this.",
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'YYYY-MM-DD' },
          time: { type: 'string', description: 'HH:MM (24h), must be one of the available slots' },
          name: { type: 'string', description: "Patient's full name as given by the customer" },
          phone: { type: 'string', description: "Patient's phone number as given by the customer (may differ from the caller's number)" },
          email: { type: 'string', description: "Patient's email if given" },
          practitioner_name: { type: 'string' },
          duration: { type: 'number' },
          reason: { type: 'string' },
          date_of_birth: { type: 'string', description: 'Patient DOB YYYY-MM-DD (only if a new patient)' },
          gender: { type: 'string', enum: ['male', 'female'] },
          title: { type: 'string', description: 'Mr/Mrs/Ms/Dr (only if a new patient)' },
        },
        required: ['date', 'time'],
      },
    });
    tools.push({
      name: 'dentally_get_appointments',
      description: "Look up the customer's own existing/upcoming appointments. Use when they ask \"what/when is my appointment\", \"which doctor do I have\", \"do I have an appointment\". Read the real result; never guess.",
      parameters: { type: 'object', properties: { message: { type: 'string' } } },
    });
  }

  return tools;
}

// ── Per-provider converters ──────────────────────────────────────────────────

/** OpenAI Chat Completions: { type:'function', function:{ name, description, parameters } }. */
export function toOpenAiChatbotTools(tools: NeutralTool[]): any[] {
  return tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));
}

/** Anthropic Messages: { name, description, input_schema }. */
export function toAnthropicChatbotTools(tools: NeutralTool[]): any[] {
  return tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters }));
}

/** Gemini functionDeclarations: uppercase JSON-Schema types, no `default`. */
export function toGeminiChatbotTools(tools: NeutralTool[]): any[] {
  return tools.map((t) => ({ name: t.name, description: t.description, parameters: toGeminiSchema(t.parameters) }));
}

/** Recursively convert a neutral schema to Gemini's OpenAPI subset. */
function toGeminiSchema(node: any): any {
  if (Array.isArray(node)) return node.map(toGeminiSchema);
  if (!node || typeof node !== 'object') return node;
  const out: any = {};
  for (const [k, v] of Object.entries(node)) {
    if (k === 'default') continue; // not supported by Gemini's schema subset
    if (k === 'type' && typeof v === 'string') out[k] = v.toUpperCase();
    else if (k === 'properties' && v && typeof v === 'object') {
      out[k] = Object.fromEntries(Object.entries(v).map(([pk, pv]) => [pk, toGeminiSchema(pv)]));
    } else out[k] = toGeminiSchema(v);
  }
  return out;
}

// ── Tool call → engine intent ────────────────────────────────────────────────

/**
 * Map a provider tool call (name + parsed args object) to the engine's intent.
 * Shared by all three providers — args is already a plain object by this point.
 * Returns null for unknown tool names (caller falls back to the plain text reply).
 */
export function mapChatbotToolCall(name: string, rawArgs: any): ChatbotToolIntent | null {
  const a = rawArgs ?? {};
  switch (name) {
    case 'transfer_conversation': return { reply: a.message ?? '', transferTo: a.destination };
    case 'resolve_conversation':  return { reply: a.message ?? '', resolveConversation: true };
    case 'set_waiting':           return { reply: a.message ?? '', setWaiting: true };
    case 'create_deal':           return { reply: a.message ?? '', createDeal: { title: a.title, value: a.value, currency: a.currency, stageName: a.stage_name, notes: a.notes } };
    case 'update_deal':           return { reply: a.message ?? '', updateDeal: { dealId: a.deal_id, stageName: a.stage_name, value: a.value, notes: a.notes, status: a.status } };
    case 'add_tag':               return { reply: a.message ?? '', addTag: { tagName: a.tag_name } };
    case 'remove_tag':            return { reply: a.message ?? '', removeTag: { tagName: a.tag_name } };
    case 'create_task':           return { reply: a.message ?? '', createTask: { title: a.title, description: a.description, dueDate: a.due_date, priority: a.priority } };
    case 'update_contact':        return { reply: a.message ?? '', updateContact: { fullName: a.full_name, phone: a.phone, email: a.email, jobTitle: a.job_title, notes: a.notes, customFields: a.custom_fields } };
    case 'create_payment_link':   return { reply: a.message ?? '', createPaymentLink: { amount: a.amount, currency: a.currency ?? 'USD', description: a.description } };
    case 'dentally_list_practitioners': return { reply: a.message ?? '', dentallyListPractitioners: true };
    case 'dentally_check_availability': return { reply: a.message ?? '', dentallyCheckAvailability: { date: a.date, practitionerName: a.practitioner_name, durationMinutes: a.duration } };
    case 'dentally_book_appointment':   return { reply: a.message ?? '', dentallyBook: { date: a.date, time: a.time, practitionerName: a.practitioner_name, durationMinutes: a.duration, reason: a.reason, name: a.name, phone: a.phone, email: a.email, dateOfBirth: a.date_of_birth, gender: a.gender, title: a.title } };
    case 'dentally_get_appointments':   return { reply: a.message ?? '', dentallyGetAppointments: true };
  }
  return null;
}
