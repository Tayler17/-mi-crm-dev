export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

function getToken(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('token') || '';
}

function getTenantId(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('tenantId') || '';
}

function authHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${getToken()}`,
    'X-Tenant-ID': getTenantId(),
  };
}

async function handleResponse(res: Response) {
  if (res.status === 401) {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('token');
      localStorage.removeItem('tenantId');
      window.location.href = '/login';
    }
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    const text = await res.text();
    // Surface only the human-readable message — never the raw {error, statusCode} JSON.
    let msg = `HTTP ${res.status}`;
    try {
      const j = JSON.parse(text);
      if (j?.message) msg = Array.isArray(j.message) ? j.message.join(', ') : String(j.message);
    } catch {
      if (text) msg = text;
    }
    throw new Error(msg);
  }
  return res.json();
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function login(email: string, password: string, tenantSlugOrId: string) {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Tenant-ID': tenantSlugOrId },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Credenciales incorrectas');
  }
  const data = await res.json();
  localStorage.setItem('token', data.accessToken);
  // Always store the resolved UUID from the response, not the typed slug
  localStorage.setItem('tenantId', data.user.tenantId);
  localStorage.setItem('user', JSON.stringify(data.user));
  return data;
}

export async function register(payload: {
  workspaceName: string;
  slug: string;
  fullName: string;
  email: string;
  password: string;
  acceptedTerms: boolean;
  lang?: string;
}) {
  const res = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = Array.isArray(err.message) ? err.message[0] : (err.message || 'Error al crear el workspace');
    throw new Error(msg);
  }
  const data = await res.json();
  localStorage.setItem('token', data.accessToken);
  localStorage.setItem('tenantId', data.user.tenantId);
  localStorage.setItem('user', JSON.stringify(data.user));
  return data;
}

export async function verifyEmail(token: string) {
  const res = await fetch(`${API_URL}/auth/verify-email?token=${encodeURIComponent(token)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'El enlace es inválido o ya fue usado.');
  }
  return res.json();
}

export function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('tenantId');
  localStorage.removeItem('user');
  window.location.href = '/login';
}

export function getStoredUser() {
  if (typeof window === 'undefined') return null;
  const u = localStorage.getItem('user');
  return u ? JSON.parse(u) : null;
}

// ── Generic ───────────────────────────────────────────────────────────────────

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  return handleResponse(res);
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  return handleResponse(res);
}

export async function apiDelete(path: string): Promise<void> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok && res.status !== 204) await handleResponse(res);
}

// ── Contacts ──────────────────────────────────────────────────────────────────

export interface Contact {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  jobTitle: string;
  companyId: string;
  company_name?: string;
  location?: string;
  website?: string;
  notes?: string;
  createdAt: string;
}

export interface ContactProfile {
  contact: Contact;
  deals: any[];
  conversations: any[];
  tags: { id: string; name: string; color: string }[];
  notes: any[];
  activities: any[];
}

export interface ContactsPage { data: Contact[]; total: number; page: number; limit: number; }
export const getContacts = (page = 1, limit = 100, search = '') => {
  const p = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (search) p.set('search', search);
  return apiGet<ContactsPage>(`/contacts?${p}`);
};
export const exportAllContacts = (search = '') => {
  const p = new URLSearchParams();
  if (search) p.set('search', search);
  return apiGet<Pick<Contact, 'fullName' | 'email' | 'phone' | 'jobTitle' | 'location' | 'createdAt'>[]>(
    `/contacts/export${p.toString() ? `?${p}` : ''}`,
  );
};
export const getContact = (id: string) => apiGet<Contact>(`/contacts/${id}`);
export const getContactProfile = (id: string) => apiGet<ContactProfile>(`/contacts/${id}/profile`);
export const createContact = (data: Partial<Contact>) => apiPost<Contact>('/contacts', data);
export const updateContact = (id: string, data: Partial<Contact>) => apiPatch<Contact>(`/contacts/${id}`, data);
export const deleteContact = (id: string) => apiDelete(`/contacts/${id}`);
export const getContactDuplicates = () => apiGet<{ ids: string[]; names: string[]; email: string; phone: string; count: number }[]>('/contacts/duplicates/list');
export const mergeContacts = (keepId: string, mergeId: string) => apiPost<{ ok: boolean }>(`/contacts/${keepId}/merge/${mergeId}`, {});

export interface CsvImportResult {
  created: number; updated: number; skipped: number; total: number;
  errors: { row: number; reason: string }[];
}
export async function importContactsCsv(file: File): Promise<CsvImportResult> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_URL}/contacts/import`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getToken()}`, 'X-Tenant-ID': getTenantId() },
    body: form,
  });
  return handleResponse(res);
}
export const addContactTag = (contactId: string, tagId: string) => apiPost(`/contacts/${contactId}/tags/${tagId}`, {});
export const removeContactTag = (contactId: string, tagId: string) => apiDelete(`/contacts/${contactId}/tags/${tagId}`);

// ── Deals ─────────────────────────────────────────────────────────────────────

export interface Deal {
  id: string;
  title: string;
  value: number;
  currency: string;
  status: string;
  priority: string;
  notes?: string;
  stageId: string;
  stage?: { id: string; name: string };
  contactId: string;
  contact?: { id: string; fullName: string };
  createdAt: string;
}

export interface DealDetail {
  deal: Deal & { stage_name: string; pipeline_name: string; pipeline_id: string; contact: any; company: any; assigned_user: any; expected_close_date?: string };
  tasks: any[];
  notes: any[];
  conversations: any[];
  activities: any[];
  calls: any[];
}

export const getDeals = () => apiGet<Deal[]>('/deals');
export const getDealsKanban = (pipelineId?: string) =>
  apiGet<Deal[]>(`/deals/kanban${pipelineId ? `?pipelineId=${pipelineId}` : ''}`);
export const getDeal = (id: string) => apiGet<Deal>(`/deals/${id}`);
export const getDealDetail = (id: string) => apiGet<DealDetail>(`/deals/${id}/detail`);
export const createDeal = (data: Partial<Deal>) => apiPost<Deal>('/deals', data);
export const updateDeal = (id: string, data: Partial<Deal>) => apiPatch<Deal>(`/deals/${id}`, data);
export const updateDealStage = (id: string, stageId: string) => apiPatch(`/deals/${id}/stage`, { stageId });
export const deleteDeal = (id: string) => apiDelete(`/deals/${id}`);

// ── Pipelines ─────────────────────────────────────────────────────────────────

export interface PipelineStage {
  id: string;
  name: string;
  position: number;
}

export interface Pipeline {
  id: string;
  name: string;
  isDefault: boolean;
  createdAt: string;
}

export const getPipelines = () => apiGet<Pipeline[]>('/pipelines');
export const getPipeline = (id: string) => apiGet<Pipeline>(`/pipelines/${id}`);
export const createPipeline = (data: Partial<Pipeline>) => apiPost<Pipeline>('/pipelines', data);
export const updatePipeline = (id: string, data: Partial<Pipeline>) => apiPatch<Pipeline>(`/pipelines/${id}`, data);
export const deletePipeline = (id: string) => apiDelete(`/pipelines/${id}`);
export const getPipelineStages = (id: string) => apiGet<PipelineStage[]>(`/pipelines/${id}/stages`);
export const createStage = (pipelineId: string, data: Partial<PipelineStage>) =>
  apiPost<PipelineStage>(`/pipelines/${pipelineId}/stages`, data);
export const updateStage = (pipelineId: string, stageId: string, data: Partial<PipelineStage>) =>
  apiPatch<PipelineStage>(`/pipelines/${pipelineId}/stages/${stageId}`, data);
export const deleteStage = (pipelineId: string, stageId: string) =>
  apiDelete(`/pipelines/${pipelineId}/stages/${stageId}`);

// ── Tasks ─────────────────────────────────────────────────────────────────────

export interface Task {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  dueDate: string;
  contactId: string;
  dealId: string;
  assignedTo: string;
  createdAt: string;
}

export const getTasks = () => apiGet<Task[]>('/tasks');
export const getTask = (id: string) => apiGet<Task>(`/tasks/${id}`);
export const createTask = (data: Partial<Task>) => apiPost<Task>('/tasks', data);
export const updateTask = (id: string, data: Partial<Task>) => apiPatch<Task>(`/tasks/${id}`, data);
export const deleteTask = (id: string) => apiDelete(`/tasks/${id}`);

// ── Inboxes ───────────────────────────────────────────────────────────────────

export interface Inbox {
  id: string;
  name: string;
  channelType: string;
  isEnabled: boolean;
}

export const getInboxes = () => apiGet<Inbox[]>('/inboxes');

// ── Agents ────────────────────────────────────────────────────────────────────

export interface Agent {
  id: string;
  fullName: string;
  email: string;
  role: string;
  availability?: string; // online | away | busy | offline
}

export const getAgents = () => apiGet<Agent[]>('/auth/agents');
export const setMyAvailability = (availability: string) =>
  apiPatch<{ availability: string }>('/auth/me/availability', { availability });

// ── Users CRUD ────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  fullName: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  availability?: string;
  lastSeenAt?: string | null;
}

export const getUsers = () => apiGet<User[]>('/auth/users');
export const touchLastSeen = () => apiPost('/auth/me/seen', {});
export const createUser = (data: { email: string; fullName: string; password: string; role?: string }) =>
  apiPost<User>('/auth/users', data);
export const updateUser = (id: string, data: Partial<User> & { password?: string }) =>
  apiPatch<User>(`/auth/users/${id}`, data);
export const deactivateUser = (id: string) => apiDelete(`/auth/users/${id}`);

// ── Conversations ─────────────────────────────────────────────────────────────

export interface ConversationContact {
  id: string;
  fullName: string;
  email: string;
  phone: string;
}

export interface ConversationInbox {
  id: string;
  name: string;
  channelType: string;
}

export interface ConversationAgent {
  id: string;
  fullName: string;
  email: string;
}

export interface Conversation {
  id: string;
  status: string;
  subject: string;
  channelType: string;
  assignedTo: string;
  inboxId: string;
  contactId: string;
  teamId?: string;
  queueId?: string;
  assignedUserId?: string;
  createdAt: string;
  updatedAt: string;
  isGroup?: boolean;
  // enriched
  contact?: ConversationContact;
  inbox?: ConversationInbox;
  assignedAgent?: ConversationAgent;
  messageCount?: number;
  lastMessageAt?: string;
  tags?: Tag[];
}

export const getConversations = (filters?: {
  status?: string;
  assignedTo?: string;
  inboxId?: string;
  tagId?: string;
  queueId?: string;
}) => {
  const params = new URLSearchParams();
  if (filters?.status)     params.set('status',     filters.status);
  if (filters?.assignedTo) params.set('assignedTo', filters.assignedTo);
  if (filters?.inboxId)    params.set('inboxId',    filters.inboxId);
  if (filters?.tagId)      params.set('tagId',      filters.tagId);
  if (filters?.queueId)    params.set('queueId',    filters.queueId);
  const qs = params.toString();
  return apiGet<Conversation[]>(`/conversations${qs ? `?${qs}` : ''}`);
};
export const getConversation = (id: string) => apiGet<Conversation>(`/conversations/${id}`);
export const createConversation = (data: Partial<Conversation>) => apiPost<Conversation>('/conversations', data);
export const updateConversation = (id: string, data: Partial<Conversation>) =>
  apiPatch<Conversation>(`/conversations/${id}`, data);
export const deleteConversation = (id: string) => apiDelete(`/conversations/${id}`);
export const getConversationTags = (id: string) => apiGet<Tag[]>(`/conversations/${id}/tags`);
export const addConversationTag = (id: string, tagId: string) => apiPost(`/conversations/${id}/tags/${tagId}`, {});
export const removeConversationTag = (id: string, tagId: string) => apiDelete(`/conversations/${id}/tags/${tagId}`);

export interface BotSession {
  id: string;
  status: 'active' | 'handed_off';
  handed_off_at: string | null;
  chatbot_id: string;
  bot_name: string;
}
export const getConvBotSession = (id: string) => apiGet<BotSession | null>(`/conversations/${id}/bot-session`);
export const updateConvBotSession = (id: string, action: 'take_over' | 'restore_bot') =>
  apiPatch<BotSession | null>(`/conversations/${id}/bot-session`, { action });

// ── Messages ──────────────────────────────────────────────────────────────────

export interface Message {
  id: string;
  body: string;
  senderType: string;
  senderId: string;
  direction: string;
  contentType: string;
  isPrivate: boolean;
  status?: string;
  createdAt: string;
}

// ── Quick Responses (Canned Responses) ───────────────────────────────────────

export interface CannedResponse {
  id: string;
  title: string;
  content: string;
  shortCode?: string;
  category?: string;
  createdAt: string;
  updatedAt: string;
}

export const getCannedResponses = () => apiGet<CannedResponse[]>('/canned-responses');
export const createCannedResponse = (data: Partial<CannedResponse>) => apiPost<CannedResponse>('/canned-responses', data);
export const updateCannedResponse = (id: string, data: Partial<CannedResponse>) => apiPatch<CannedResponse>(`/canned-responses/${id}`, data);
export const deleteCannedResponse = (id: string) => apiDelete(`/canned-responses/${id}`);

// ── Tags ──────────────────────────────────────────────────────────────────────

export interface Tag {
  id: string;
  name: string;
  color?: string;
  createdAt: string;
  contactCount?: number;
  conversationCount?: number;
}

export const getTags = () => apiGet<Tag[]>('/tags');
export const createTag = (data: Partial<Tag>) => apiPost<Tag>('/tags', data);
export const updateTag = (id: string, data: Partial<Tag>) => apiPatch<Tag>(`/tags/${id}`, data);
export const deleteTag = (id: string) => apiDelete(`/tags/${id}`);

// ── Dashboard ─────────────────────────────────────────────────────────────────

export interface DashboardStats {
  contacts: { total: number };
  conversations: { total: number; open: number; pending: number; resolved: number; in_range: number };
  deals: { total: number; won: number; lost: number; active: number; pipeline_value: string; won_value: string };
  tasks: { total: number; overdue: number; due_today: number; completed: number };
  dateRange?: { from: string; to: string; rangeDays: number };
  campaigns: { total: number; active: number; total_sent: number };
  companies: { total: number; with_contacts: number; with_deals: number };
  connections: { total: number; active: number; errors: number };
  automations: { total: number; active: number; total_executions: number };
  flows: { total: number; active: number; running_sessions: number };
  announcements: { id: string; title: string; type: string; body: string; expires_at: string | null; created_at: string }[];
  recentConversations: any[];
  dealsByStage: { name: string; count: number; value: string }[];
  conversationsTrend: { day: string; count: number }[];
}

export const getDashboardStats = (from?: string, to?: string) => {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to)   params.set('to', to);
  const qs = params.toString();
  return apiGet<DashboardStats>(`/dashboard/stats${qs ? `?${qs}` : ''}`);
};

// ── Reports ───────────────────────────────────────────────────────────────────

export const getConversationsReport = (from?: string, to?: string) => {
  const p = new URLSearchParams();
  if (from) p.set('from', from);
  if (to) p.set('to', to);
  return apiGet<any>(`/reports/conversations${p.toString() ? `?${p}` : ''}`);
};
export const getDealsReport = (from?: string, to?: string) => {
  const p = new URLSearchParams();
  if (from) p.set('from', from);
  if (to) p.set('to', to);
  return apiGet<any>(`/reports/deals${p.toString() ? `?${p}` : ''}`);
};
export const getTeamsReport = () => apiGet<any>('/reports/teams');
export const getContactsReport = (from?: string, to?: string) => {
  const p = new URLSearchParams();
  if (from) p.set('from', from);
  if (to) p.set('to', to);
  return apiGet<any>(`/reports/contacts${p.toString() ? `?${p}` : ''}`);
};
export const getCallsReport = (from?: string, to?: string) => {
  const p = new URLSearchParams();
  if (from) p.set('from', from);
  if (to) p.set('to', to);
  return apiGet<any>(`/reports/calls${p.toString() ? `?${p}` : ''}`);
};
export const getSlaReport = (from?: string, to?: string) => {
  const p = new URLSearchParams();
  if (from) p.set('from', from);
  if (to) p.set('to', to);
  return apiGet<any>(`/reports/sla${p.toString() ? `?${p}` : ''}`);
};

// ── CSAT ──────────────────────────────────────────────────────────────────────

export const requestCsat = (conversationId: string) =>
  apiPost<{ token: string; surveyUrl: string }>(`/csat/request/${conversationId}`, {});

export const submitCsat = (token: string, score: number, comment?: string) =>
  fetch(`${API_URL}/csat/submit/${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ score, comment }),
  }).then((r) => r.json());

export const getCsatReport = (from?: string, to?: string) => {
  const p = new URLSearchParams();
  if (from) p.set('from', from);
  if (to) p.set('to', to);
  return apiGet<any>(`/csat/report${p.toString() ? `?${p}` : ''}`);
};

export const getConversationCsat = (conversationId: string) =>
  apiGet<any[]>(`/csat/conversation/${conversationId}`);

// ── Outbound Webhooks ─────────────────────────────────────────────────────────

export interface OutboundWebhook {
  id: string;
  name: string;
  url: string;
  secret?: string;
  events: string[];
  isActive: boolean;
  lastFiredAt?: string;
  createdAt: string;
}

export const getOutboundWebhooks    = () => apiGet<OutboundWebhook[]>('/outbound-webhooks');
export const getSupportedWebhookEvents = () => apiGet<{ events: string[] }>('/outbound-webhooks/events');
export const createOutboundWebhook  = (dto: Partial<OutboundWebhook>) => apiPost<OutboundWebhook>('/outbound-webhooks', dto);
export const updateOutboundWebhook  = (id: string, dto: Partial<OutboundWebhook>) => apiPatch<OutboundWebhook>(`/outbound-webhooks/${id}`, dto);
export const deleteOutboundWebhook  = (id: string) => apiDelete(`/outbound-webhooks/${id}`);
export const testOutboundWebhook    = (id: string) => apiPost<{ ok: boolean }>(`/outbound-webhooks/${id}/test`, {});

export interface WebhookLog {
  id: string;
  event: string;
  status: 'success' | 'error';
  status_code?: number;
  error_message?: string;
  duration_ms?: number;
  created_at: string;
}
export const getWebhookLogs = (id: string) => apiGet<WebhookLog[]>(`/outbound-webhooks/${id}/logs`);

// ── Custom Fields ─────────────────────────────────────────────────────────────

export interface CustomFieldDef {
  id: string;
  entityType: string;
  name: string;
  label: string;
  fieldType: string;
  options?: string[];
  isRequired: boolean;
  position: number;
}

export interface CustomFieldValue {
  definitionId: string;
  name: string;
  label: string;
  fieldType: string;
  options?: string[];
  isRequired: boolean;
  valueId?: string;
  value?: string;
}

export const getCustomFieldDefs    = (entityType?: string) => apiGet<CustomFieldDef[]>(`/custom-fields/definitions${entityType ? `?entityType=${entityType}` : ''}`);
export const createCustomFieldDef  = (dto: Partial<CustomFieldDef>) => apiPost<CustomFieldDef>('/custom-fields/definitions', dto);
export const updateCustomFieldDef  = (id: string, dto: Partial<CustomFieldDef>) => apiPatch<CustomFieldDef>(`/custom-fields/definitions/${id}`, dto);
export const deleteCustomFieldDef  = (id: string) => apiDelete(`/custom-fields/definitions/${id}`);
export const getCustomFieldValues  = (entityType: string, entityId: string) => apiGet<CustomFieldValue[]>(`/custom-fields/values/${entityType}/${entityId}`);
export const setCustomFieldValues  = (entityType: string, entityId: string, values: { definitionId: string; value: string | null }[]) =>
  apiPost(`/custom-fields/values/${entityType}/${entityId}`, { values });

// ── Companies ─────────────────────────────────────────────────────────────────

export interface Company {
  id: string;
  name: string;
  industry?: string;
  website?: string;
  tenantId: string;
  createdAt: string;
  // enriched
  contact_count?: number;
  deal_count?: number;
  pipeline_value?: string;
}

export const getCompanies = () => apiGet<Company[]>('/companies');
export const createCompany = (data: Partial<Company>) => apiPost<Company>('/companies', data);
export const updateCompany = (id: string, data: Partial<Company>) => apiPatch<Company>(`/companies/${id}`, data);
export const deleteCompany = (id: string) => apiDelete(`/companies/${id}`);
export const getCompanyContacts = (id: string) => apiGet<any[]>(`/companies/${id}/contacts`);
export const getCompanyDeals = (id: string) => apiGet<any[]>(`/companies/${id}/deals`);

// ── Call Bots ─────────────────────────────────────────────────────────────────

export interface CallBot {
  id: string;
  name: string;
  status: 'active' | 'inactive' | 'draft';
  phoneNumber?: string;
  language: string;
  voiceType: string;
  ttsProvider: 'twilio_basic' | 'openai_tts' | 'elevenlabs';
  ttsVoiceId?: string;
  provider: string;
  providerConfig: Record<string, any>;
  systemPrompt?: string;
  welcomeMessage?: string;
  fallbackMessage?: string;
  handoffKeyword: string;
  inboxId?: string;
  queueIds: string[];
  maxCallDuration: number;
  totalCalls: number;
  handledCalls: number;
  transferredCalls: number;
  voiceCatalogId?: string;
  visualConfig?: {
    emoji?: string;
    color?: string;
    businessName?: string;
    industry?: string;
    products?: string;
    tone?: string;
    restrictions?: string;
    specialInstructions?: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface CallLog {
  id: string;
  botId?: string;
  botName?: string;
  direction: 'inbound' | 'outbound';
  fromNumber?: string;
  toNumber?: string;
  duration: number;
  status: string;
  outcome: string;
  transcript?: string;
  startedAt: string;
  endedAt?: string;
}

export interface CallBotStats {
  totalBots: number;
  activeBots: number;
  total_calls: number;
  avg_duration: number;
  transferred: number;
  handled: number;
  calls_today: number;
}

export const getCallBots = () => apiGet<CallBot[]>('/call-bots');
export const getCallBot = (id: string) => apiGet<CallBot>(`/call-bots/${id}`);
export const createCallBot = (data: Partial<CallBot>) => apiPost<CallBot>('/call-bots', data);
export const updateCallBot = (id: string, data: Partial<CallBot>) => apiPatch<CallBot>(`/call-bots/${id}`, data);
export const deleteCallBot = (id: string) => apiDelete(`/call-bots/${id}`);
export const toggleCallBot = (id: string) => apiPost<CallBot>(`/call-bots/${id}/toggle`, {});
export const getCallLogs = (botId?: string) =>
  apiGet<CallLog[]>(`/call-bots/logs${botId ? `?botId=${botId}` : ''}`);
export const getCallBotStats = () => apiGet<CallBotStats>('/call-bots/stats');
export const initiateCall = (botId: string, toNumber: string) =>
  apiPost<{ callSid: string; status: string }>(`/call-bots/${botId}/call`, { toNumber });

// ── Phone numbers (on-demand Twilio provisioning) ──────────────────────────────

export interface AvailableNumber {
  phoneNumber: string;
  friendlyName: string;
  locality: string;
  region: string;
  country: string;
  capabilities: { voice?: boolean; SMS?: boolean; MMS?: boolean };
}
export interface OwnedNumber {
  id: string;
  phone_number: string;
  phone_sid: string;
  country: string | null;
  friendly_name: string | null;
  status: string;
  created_at: string;
}
export const searchPhoneNumbers = (params: { country?: string; type?: string; areaCode?: string; contains?: string }) => {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v) as [string, string][],
  ).toString();
  return apiGet<AvailableNumber[]>(`/phone-numbers/search?${qs}`);
};
export const getMyPhoneNumbers = () => apiGet<OwnedNumber[]>('/phone-numbers');
export const buyPhoneNumber = (phoneNumber: string, country?: string, type?: string) =>
  apiPost<OwnedNumber>('/phone-numbers/buy', { phoneNumber, country, type });
export const releasePhoneNumber = (id: string) => apiDelete(`/phone-numbers/${id}`);

export interface TwilioInventoryNumber {
  phoneNumber: string;
  sid: string;
  friendlyName: string;
  assignedTenantId: string | null;
}
export const getTwilioInventory = () => apiGet<TwilioInventoryNumber[]>('/phone-numbers/twilio-inventory');
export const assignPhoneNumber = (phoneNumber: string, tenantId: string) =>
  apiPost<OwnedNumber>('/phone-numbers/assign', { phoneNumber, tenantId });

// ── Regulatory verification (per-tenant bundles) ───────────────────────────────

export interface RegulatoryBundle {
  id: string;
  tenant_id: string;
  tenant_name?: string;
  country: string;
  number_type: string;
  status: 'submitted' | 'approved' | 'rejected';
  bundle_sid: string | null;
  address_sid: string | null;
  business_name: string | null;
  contact_email: string | null;
  address_text: string | null;
  doc_urls: string[];
  notes: string | null;
  created_at: string;
  updated_at: string;
}
export const getMyRegulatory = () => apiGet<RegulatoryBundle[]>('/phone-numbers/regulatory');
export const submitRegulatory = (data: {
  country: string; numberType?: string; businessName?: string;
  contactEmail?: string; addressText?: string; docUrls?: string[];
}) => apiPost<RegulatoryBundle>('/phone-numbers/regulatory', data);
export const getAllRegulatory = () => apiGet<RegulatoryBundle[]>('/phone-numbers/regulatory/all');
export interface TwilioBundleOpt { sid: string; label: string; status?: string; isoCountry?: string; numberType?: string }
export interface TwilioAddressOpt { sid: string; label: string }
export const getTwilioBundles = () => apiGet<TwilioBundleOpt[]>('/phone-numbers/twilio-bundles');
export const getTwilioAddresses = () => apiGet<TwilioAddressOpt[]>('/phone-numbers/twilio-addresses');
export const approveRegulatory = (id: string, bundleSid: string, addressSid: string) =>
  apiPost<RegulatoryBundle>(`/phone-numbers/regulatory/${id}/approve`, { bundleSid, addressSid });
export const rejectRegulatory = (id: string, notes: string) =>
  apiPost<RegulatoryBundle>(`/phone-numbers/regulatory/${id}/reject`, { notes });
export async function uploadRegulatoryDoc(file: File): Promise<{ url: string; name: string }> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`${API_URL}/phone-numbers/regulatory/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getToken()}`, 'X-Tenant-ID': getTenantId() },
    body: fd,
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || 'Error al subir');
  return res.json();
}
export async function downloadRegulatoryDoc(filename: string): Promise<void> {
  const res = await fetch(`${API_URL}/phone-numbers/regulatory/doc/${encodeURIComponent(filename)}`, {
    headers: { Authorization: `Bearer ${getToken()}`, 'X-Tenant-ID': getTenantId() },
  });
  if (!res.ok) throw new Error(`Error ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

// ── Campaigns ─────────────────────────────────────────────────────────────────

export interface Campaign {
  id: string;
  name: string;
  type: 'email' | 'whatsapp' | 'sms';
  status: 'draft' | 'scheduled' | 'running' | 'paused' | 'completed' | 'cancelled';
  subject?: string;
  content?: string;
  messages: string[];
  inboxId?: string;
  scheduleId?: string;
  schedule_name?: string;
  confirmationEnabled: boolean;
  scheduledAt?: string;
  startedAt?: string;
  completedAt?: string;
  sentCount: number;
  deliveredCount: number;
  openedCount: number;
  clickedCount: number;
  contactCount?: number;
  listCount?: number;
  targetLists?: { id: string; name: string }[];
  createdAt: string;
  updatedAt: string;
}

export interface CampaignContactRow {
  id: string;
  contact_id: string;
  status: string;
  sent_at?: string;
  full_name?: string;
  email?: string;
  phone?: string;
}

export const getCampaigns = () => apiGet<Campaign[]>('/campaigns');
export const getCampaign = (id: string) => apiGet<Campaign>(`/campaigns/${id}`);
export const createCampaign = (data: Partial<Campaign>) => apiPost<Campaign>('/campaigns', data);
export const updateCampaign = (id: string, data: Partial<Campaign>) => apiPatch<Campaign>(`/campaigns/${id}`, data);
export const deleteCampaign = (id: string) => apiDelete(`/campaigns/${id}`);
export const getCampaignContacts = (id: string) => apiGet<CampaignContactRow[]>(`/campaigns/${id}/contacts`);
export const addCampaignContacts = (id: string, contactIds: string[]) =>
  apiPost(`/campaigns/${id}/contacts`, { contactIds });
export const searchCampaignContacts = (id: string, search?: string, tagIds?: string[]) => {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (tagIds?.length) params.set('tagIds', tagIds.join(','));
  return apiGet<any[]>(`/campaigns/${id}/contacts/search${params.toString() ? `?${params}` : ''}`);
};
export const addCampaignContactsBulk = (id: string, data: { search?: string; tagIds?: string[]; contactIds?: string[] }) =>
  apiPost<{ added: number }>(`/campaigns/${id}/contacts/bulk`, data);
export const clearCampaignContacts = (id: string) => apiDelete(`/campaigns/${id}/contacts`);
export const removeCampaignContact = (id: string, contactId: string) =>
  apiDelete(`/campaigns/${id}/contacts/${contactId}`);
export const launchCampaign = (id: string) => apiPost<Campaign>(`/campaigns/${id}/launch`, {});
export const pauseCampaign = (id: string) => apiPost<Campaign>(`/campaigns/${id}/pause`, {});
export const getCampaignTargetLists = (id: string) => apiGet<any[]>(`/campaigns/${id}/lists`);
export const addCampaignTargetList = (id: string, listId: string) => apiPost(`/campaigns/${id}/lists/${listId}`, {});
export const removeCampaignTargetList = (id: string, listId: string) => apiDelete(`/campaigns/${id}/lists/${listId}`);
export const getCampaignRecipients = (id: string) => apiGet<CampaignContactRow[]>(`/campaigns/${id}/contacts`);
export const resolveAllRecipients = (id: string) => apiGet<any[]>(`/campaigns/${id}/recipients`);

// ── Contact Lists ─────────────────────────────────────────────────────────────

export interface ContactList {
  id: string;
  name: string;
  description?: string;
  contactCount: number;
  createdAt: string;
}

export const getContactLists = () => apiGet<ContactList[]>('/contact-lists');
export const createContactList = (data: { name: string; description?: string }) =>
  apiPost<ContactList>('/contact-lists', data);
export const updateContactList = (id: string, data: { name?: string; description?: string }) =>
  apiPatch<ContactList>(`/contact-lists/${id}`, data);
export const deleteContactList = (id: string) => apiDelete(`/contact-lists/${id}`);
export const getContactListContacts = (id: string) => apiGet<any[]>(`/contact-lists/${id}/contacts`);
export const searchContactListContacts = (id: string, search?: string, tagIds?: string[]) => {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (tagIds?.length) params.set('tagIds', tagIds.join(','));
  return apiGet<any[]>(`/contact-lists/${id}/contacts/search${params.toString() ? `?${params}` : ''}`);
};
export const addContactListContacts = (id: string, contactIds: string[]) =>
  apiPost<{ added: number }>(`/contact-lists/${id}/contacts`, { contactIds });
export const removeContactListContact = (id: string, contactId: string) =>
  apiDelete(`/contact-lists/${id}/contacts/${contactId}`);
export const clearContactListContacts = (id: string) => apiDelete(`/contact-lists/${id}/contacts`);

// ── Appointments ──────────────────────────────────────────────────────────────

export interface Appointment {
  id: string;
  contactId?: string;
  contact_name?: string;
  contact_phone?: string;
  contact_email?: string;
  userId?: string;
  user_name?: string;
  title?: string;
  message?: string;
  inboxId?: string;
  scheduledAt: string;
  timezone: string;
  status: 'pending' | 'sent' | 'cancelled';
  openTicket: boolean;
  ticketStatus: string;
  assignedUserId?: string;
  notes?: string;
  createdAt: string;
}

export const getAppointments = (from?: string, to?: string) => {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  return apiGet<Appointment[]>(`/appointments${params.toString() ? `?${params}` : ''}`);
};
export const createAppointment = (data: Partial<Appointment>) =>
  apiPost<Appointment>('/appointments', data);
export const updateAppointment = (id: string, data: Partial<Appointment>) =>
  apiPatch<Appointment>(`/appointments/${id}`, data);
export const deleteAppointment = (id: string) => apiDelete(`/appointments/${id}`);
export const getAppointmentStats = () => apiGet<{ total: number; pending: number; sent: number; cancelled: number }>('/appointments/stats');

// ── Internal Chat ─────────────────────────────────────────────────────────────

export interface ChatMemberDetail {
  id: string;
  full_name: string;
  email: string;
}

export interface ChatLastMessage {
  body: string;
  senderId: string;
  createdAt: string;
}

export interface InternalChat {
  id: string;
  name?: string;
  isGroup: boolean;
  members: { userId: string }[];
  memberDetails: ChatMemberDetail[];
  lastMessage: ChatLastMessage | null;
  unreadCount: number;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  chatId: string;
  senderId: string;
  body: string;
  createdAt: string;
  sender: { id: string; full_name?: string; email?: string };
}

export const getMyChats = () => apiGet<InternalChat[]>('/internal-chat');
export const createOrFindDm = (targetUserId: string) =>
  apiPost<InternalChat>('/internal-chat', { targetUserId });
export const getChatMessages = (chatId: string) =>
  apiGet<ChatMessage[]>(`/internal-chat/${chatId}/messages`);
export const sendChatMessage = (chatId: string, body: string) =>
  apiPost<ChatMessage>(`/internal-chat/${chatId}/messages`, { body });
export const markChatRead = (chatId: string) =>
  apiPost(`/internal-chat/${chatId}/read`, {});

// ── Schedules ─────────────────────────────────────────────────────────────────

export interface ScheduleHours {
  id?: string;
  dayOfWeek: number; // 0=Sun, 1=Mon ... 6=Sat
  isClosed: boolean;
  openTime?: string;  // HH:MM
  closeTime?: string; // HH:MM
}

export interface Schedule {
  id: string;
  name: string;
  timezone: string;
  isActive: boolean;
  aiEnabled: boolean;
  aiFallbackMessage?: string;
  hours: ScheduleHours[];
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleStatus {
  open: boolean;
  reason?: string;
  openTime?: string;
  closeTime?: string;
  timezone?: string;
}

export const getSchedules = () => apiGet<Schedule[]>('/schedules');
export const getSchedule = (id: string) => apiGet<Schedule>(`/schedules/${id}`);
export const createSchedule = (data: Partial<Schedule> & { name: string }) =>
  apiPost<Schedule>('/schedules', data);
export const updateSchedule = (id: string, data: Partial<Schedule>) =>
  apiPatch<Schedule>(`/schedules/${id}`, data);
export const deleteSchedule = (id: string) => apiDelete(`/schedules/${id}`);
export const getScheduleStatus = (id: string) => apiGet<ScheduleStatus>(`/schedules/${id}/status`);
export const getScheduleInboxes = (id: string) => apiGet<{ id: string; name: string; channel_type: string }[]>(`/schedules/${id}/inboxes`);
export const assignScheduleInbox = (scheduleId: string, inboxId: string) =>
  apiPost(`/schedules/${scheduleId}/inboxes/${inboxId}`, {});
export const unassignScheduleInbox = (scheduleId: string, inboxId: string) =>
  apiDelete(`/schedules/${scheduleId}/inboxes/${inboxId}`);

export interface ScheduleAssignment {
  id: string;
  schedule_id: string;
  target_type: 'inbox' | 'bot' | 'campaign' | 'user';
  target_id: string;
  target_name: string;
  created_at: string;
}

export const getScheduleAssignments = (id: string) =>
  apiGet<ScheduleAssignment[]>(`/schedules/${id}/assignments`);
export const getAssignableTargets = (id: string, type: string) =>
  apiGet<any[]>(`/schedules/${id}/assignments/available?type=${type}`);
export const addScheduleAssignment = (id: string, targetType: string, targetId: string) =>
  apiPost(`/schedules/${id}/assignments`, { targetType, targetId });
export const removeScheduleAssignment = (id: string, assignmentId: string) =>
  apiDelete(`/schedules/${id}/assignments/${assignmentId}`);

// ── Teams ─────────────────────────────────────────────────────────────────────

export interface TeamMember {
  user_id: string;
  full_name: string;
  email: string;
  role: string;
  joined_at: string;
}

export interface Team {
  id: string;
  name: string;
  description?: string;
  color: string;
  isActive: boolean;
  memberCount: number;
  members: TeamMember[];
  createdAt: string;
}

export const getTeams = () => apiGet<Team[]>('/teams');
export const createTeam = (data: { name: string; description?: string; color?: string }) =>
  apiPost<Team>('/teams', data);
export const updateTeam = (id: string, data: Partial<Team>) =>
  apiPatch<Team>(`/teams/${id}`, data);
export const deleteTeam = (id: string) => apiDelete(`/teams/${id}`);
export const getTeamMembers = (id: string) => apiGet<TeamMember[]>(`/teams/${id}/members`);
export const getAvailableUsersForTeam = (id: string) => apiGet<any[]>(`/teams/${id}/members/available`);
export const addTeamMember = (id: string, userId: string, role?: string) =>
  apiPost(`/teams/${id}/members`, { userId, role });
export const removeTeamMember = (id: string, userId: string) =>
  apiDelete(`/teams/${id}/members/${userId}`);

// ── Queues ────────────────────────────────────────────────────────────────────

export interface Queue {
  id: string;
  name: string;
  description?: string;
  teamId?: string;
  team_name?: string;
  team_color?: string;
  inboxId?: string;
  priority: number;
  maxWaitMinutes: number;
  isActive: boolean;
  activeConversations: number;
  createdAt: string;
}

export const getQueues = () => apiGet<Queue[]>('/queues');
export const createQueue = (data: Partial<Queue>) => apiPost<Queue>('/queues', data);
export const updateQueue = (id: string, data: Partial<Queue>) => apiPatch<Queue>(`/queues/${id}`, data);
export const deleteQueue = (id: string) => apiDelete(`/queues/${id}`);
export const getQueueConversations = (id: string) => apiGet<any[]>(`/queues/${id}/conversations`);
export const assignConversation = (data: { conversationId: string; queueId?: string; teamId?: string; userId?: string }) =>
  apiPost('/queues/assign', data);

// ── Connections ───────────────────────────────────────────────────────────────

export interface ChannelConnection {
  id: string;
  name: string;
  channelType: 'whatsapp' | 'whatsapp_web' | 'facebook' | 'instagram' | 'telegram' | 'sms' | 'email' | 'webchat';
  status: 'connected' | 'disconnected' | 'error' | 'pending';
  credentials: Record<string, string>;
  inboxId?: string;
  inbox_name?: string;
  errorMessage?: string;
  lastTestedAt?: string;
  isActive: boolean;
  createdAt: string;
}

export const getConnections = () => apiGet<ChannelConnection[]>('/connections');
export const createConnection = (data: Partial<ChannelConnection>) => apiPost<ChannelConnection>('/connections', data);
export const updateConnection = (id: string, data: Partial<ChannelConnection>) => apiPatch<ChannelConnection>(`/connections/${id}`, data);
export const deleteConnection = (id: string) => apiDelete(`/connections/${id}`);
export const testConnection = (id: string) => apiPost<{ ok: boolean; message: string }>(`/connections/${id}/test`, {});
export const getConnectionQr = (id: string) => apiGet<{ qr: string | null; status: string }>(`/connections/${id}/qr`);
export const startConnectionQr = (id: string) => apiPost<{ qr: string | null; status: string }>(`/connections/${id}/qr`, {});
export const disconnectConnectionQr = (id: string) => apiDelete(`/connections/${id}/qr`);

// ── Settings ──────────────────────────────────────────────────────────────────

export interface TenantSettings {
  id: string;
  name: string;
  slug: string;
  plan: string;
  logo_url?: string;
  timezone: string;
  language: string;
  currency: string;
  settings: Record<string, any>;
  is_active: boolean;
  created_at: string;
  allow_own_api_keys?: boolean;
  allow_own_twilio?: boolean;
  plan_color?: string;
  plan_name?: string;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  type: 'info' | 'warning' | 'success' | 'urgent';
  is_active: boolean;
  is_system?: boolean;
  target_tenant_id?: string | null;
  target_tenant_name?: string;
  expires_at?: string;
  author_name?: string;
  read_count: number;
  created_at: string;
}

export const getSettings = () => apiGet<TenantSettings>('/settings');
export const updateSettings = (data: Partial<TenantSettings> & { settings?: Record<string, any> }) =>
  apiPatch<TenantSettings>('/settings', data);

export type PlatformSettingEntry = { value: string; masked: boolean; fromEnv: boolean };
export type PlatformSettings = Record<string, PlatformSettingEntry>;
export const getPlatformSettings = () => apiGet<PlatformSettings>('/settings/platform');
export const updatePlatformSettings = (data: Record<string, string>) =>
  apiPatch<PlatformSettings>('/settings/platform', data);

export const getAnnouncements = () => apiGet<Announcement[]>('/settings/announcements');
export const getUnreadAnnouncements = () => apiGet<Announcement[]>('/settings/announcements/unread');
export const getSystemAnnouncements = () => apiGet<Announcement[]>('/settings/system-announcements');
export const createAnnouncement = (data: Partial<Announcement> & { isSystem?: boolean; targetTenantId?: string }) =>
  apiPost<Announcement>('/settings/announcements', data);
export const updateAnnouncement = (id: string, data: Partial<Announcement>) =>
  apiPatch<Announcement>(`/settings/announcements/${id}`, data);
export const deleteAnnouncement = (id: string) => apiDelete(`/settings/announcements/${id}`);
export const markAnnouncementRead = (id: string) => apiPost(`/settings/announcements/${id}/read`, {});

// ── Plans ─────────────────────────────────────────────────────────────────────

export interface Plan {
  id: string;
  name: string;
  slug: string;
  description?: string;
  price: number;
  currency: string;
  billing_period: string;
  max_users: number;
  max_contacts: number;
  max_inboxes: number;
  max_campaigns: number;
  max_automations: number;
  max_flows: number;
  max_call_bots: number;
  max_ai_chatbots: number;
  max_messages_month: number;
  max_call_minutes: number;
  max_phone_numbers: number;
  has_call_bots: boolean;
  has_ai_chatbots: boolean;
  has_automations: boolean;
  has_flows: boolean;
  has_reports: boolean;
  has_api_access: boolean;
  has_webhooks: boolean;
  allow_own_api_keys: boolean;
  allow_own_twilio: boolean;
  allow_overage: boolean;
  extra_message_price: number;
  extra_call_minute_price: number;
  has_image_gen: boolean;
  max_image_gen_month: number;
  has_stripe_connect: boolean;
  is_active: boolean;
  is_public: boolean;
  position: number;
  color: string;
  created_at: string;
  stripe_price_id?: string;
}

export interface AiImageGeneration {
  id: string;
  prompt: string;
  image_url: string;
  size: string;
  style: string;
  cost_usd: number;
  content_post_id?: string;
  created_at: string;
}

export interface TenantWithPlan {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  plan: string;
  plan_id?: string;
  plan_name?: string;
  plan_slug?: string;
  plan_expires_at?: string;
  trial_ends_at?: string;
  billing_email?: string;
  billing_notes?: string;
  price?: number;
  color?: string;
  created_at: string;
}

export const getPlans           = () => apiGet<Plan[]>('/plans');
export const getPublicPlans     = () => apiGet<Plan[]>('/plans/public');
export const getCurrentPlan     = () => apiGet<{ tenant: any; usage: Record<string, number>; overage: Record<string, number> | null }>('/plans/current');
export const createPlan         = (data: Partial<Plan>) => apiPost<Plan>('/plans', data);
export const updatePlan         = (id: string, data: Partial<Plan>) => apiPatch<Plan>(`/plans/${id}`, data);
export const deletePlan         = (id: string) => apiDelete(`/plans/${id}`);
export const assignPlan         = (tenantId: string, planId: string, expiresAt?: string) =>
  apiPost('/plans/assign', { tenantId, planId, expiresAt });
export const getTenantsWithPlans = () => apiGet<TenantWithPlan[]>('/plans/tenants/all');
export const updateTenantBilling = (id: string, data: Partial<TenantWithPlan>) =>
  apiPatch(`/plans/tenants/${id}`, data);

// ── Billing / Stripe ──────────────────────────────────────────────────────────

export interface BillingSubscription {
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
  stripe_subscription_status?: string;
  plan_id?: string;
  plan_name?: string;
  plan_slug?: string;
  plan_expires_at?: string;
  billing_email?: string;
  price?: number;
  billing_period?: string;
  color?: string;
}

export const getBillingSubscription = () =>
  apiGet<BillingSubscription>('/billing/subscription');

export const createCheckoutSession = (planId: string) =>
  apiPost<{ url: string }>('/billing/checkout', { planId });

export const createPortalSession = () =>
  apiPost<{ url: string }>('/billing/portal', {});

export const getBillingTransactions = (limit = 50) =>
  apiGet<any[]>(`/billing/transactions?limit=${limit}`);

// ── Stripe Connect ────────────────────────────────────────────────────────────

export interface ConnectAccount {
  id: string;
  tenant_id: string;
  provider: string;
  account_id: string | null;
  onboarding_complete: boolean;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  country: string | null;
  currency: string;
  created_at: string;
}

export const getConnectAccount  = () =>
  apiGet<ConnectAccount | null>('/billing/connect/account');

export const createConnectOnboarding = () =>
  apiPost<{ accountId: string; onboardingUrl: string | null; isNew: boolean; complete?: boolean }>(
    '/billing/connect/onboard', {},
  );

export const syncConnectAccount = () =>
  apiPost<{ chargesEnabled: boolean; payoutsEnabled: boolean; detailsSubmitted: boolean }>(
    '/billing/connect/sync', {},
  );

export const createConnectPaymentLink = (data: {
  amount: number;
  currency: string;
  description: string;
  dealId?: string;
}) => apiPost<{ url: string; sessionId: string }>('/billing/connect/payment-link', data);

// ── Backups ───────────────────────────────────────────────────────────────────

export interface BackupLog {
  id: string;
  filename: string;
  size_bytes: number | null;
  storage: 'local' | 's3';
  status: 'pending' | 'running' | 'success' | 'failed';
  triggered_by: 'cron' | 'manual';
  error_message?: string;
  duration_ms?: number;
  created_at: string;
  completed_at?: string;
}

export const getBackups    = () => apiGet<BackupLog[]>('/backups');
export const triggerBackup = () => apiPost<{ id: string }>('/backups/trigger', {});
export const deleteBackup  = (id: string) => apiDelete(`/backups/${id}`);

export async function downloadBackup(filename: string): Promise<void> {
  const res = await fetch(
    `${API_URL}/backups/${encodeURIComponent(filename)}/download`,
    { headers: { Authorization: `Bearer ${getToken()}`, 'X-Tenant-ID': getTenantId() } },
  );
  if (!res.ok) throw new Error(`Error ${res.status}`);
  const blob = await res.blob();
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// ── Automations ───────────────────────────────────────────────────────────────

export interface AutomationRule {
  id: string;
  name: string;
  triggerEvent: string;
  trigger_event?: string;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  isActive: boolean;
  is_active?: boolean;
  createdByName?: string;
  created_by_name?: string;
  executionsOk?: number;
  executions_ok?: number;
  executionsFailed?: number;
  executions_failed?: number;
  lastExecutedAt?: string;
  last_executed_at?: string;
  createdAt: string;
}

export interface AutomationCondition {
  field: string;    // e.g. 'deal.status', 'contact.tag', 'conversation.channel'
  operator: string; // 'equals', 'not_equals', 'contains', 'greater_than'
  value: string;
}

export interface AutomationAction {
  type: string;     // 'assign_agent', 'assign_team', 'add_tag', 'change_status', 'create_task', etc.
  [key: string]: any;
}

// ── Conversation Flows ────────────────────────────────────────────────────────

export interface FlowStep {
  id: string;
  type: 'message' | 'menu' | 'condition' | 'assign' | 'tag' | 'wait' | 'end' | 'input'
      | 'note' | 'create_deal' | 'close_conversation' | 'http_request';
  label?: string;
  // message / end
  text?: string;
  // menu
  options?: { label: string; nextStepId: string }[];
  // condition
  field?: string; operator?: string; value?: string;
  trueStepId?: string; falseStepId?: string;
  // assign
  assignTo?: 'agent' | 'team' | 'queue';
  assignId?: string;
  // tag
  tagName?: string;
  // wait
  seconds?: number;
  // input
  saveAs?: string;
  // note
  noteText?: string;
  // create_deal
  dealTitle?: string;
  dealStageId?: string;
  dealValue?: number;
  // close_conversation
  farewellText?: string;
  // http_request
  httpMethod?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  httpUrl?: string;
  httpHeaders?: string;
  httpBody?: string;
  httpSaveAs?: string;
  // navigation
  nextStepId?: string;
}

export interface ConversationFlow {
  id: string;
  name: string;
  description?: string;
  inboxId?: string;
  inbox_name?: string;
  triggerType: string;
  trigger_type?: string;
  triggerValue?: string;
  trigger_value?: string;
  steps: FlowStep[];
  isActive: boolean;
  is_active?: boolean;
  created_by_name?: string;
  total_sessions?: number;
  active_sessions?: number;
  completed_sessions?: number;
  createdAt: string;
}

export const getFlows = () => apiGet<ConversationFlow[]>('/flows');
export const createFlow = (data: Partial<ConversationFlow>) => apiPost<ConversationFlow>('/flows', data);
export const updateFlow = (id: string, data: Partial<ConversationFlow>) => apiPatch<ConversationFlow>(`/flows/${id}`, data);
export const deleteFlow = (id: string) => apiDelete(`/flows/${id}`);
export const toggleFlow = (id: string) => apiPost<{ id: string; isActive: boolean }>(`/flows/${id}/toggle`, {});
export const duplicateFlow = (id: string) => apiPost<ConversationFlow>(`/flows/${id}/duplicate`, {});
export const getFlowSessions = (id: string) => apiGet<any[]>(`/flows/${id}/sessions`);

export const getAutomations = () => apiGet<AutomationRule[]>('/automations');
export const createAutomation = (data: Partial<AutomationRule>) => apiPost<AutomationRule>('/automations', data);
export const updateAutomation = (id: string, data: Partial<AutomationRule>) => apiPatch<AutomationRule>(`/automations/${id}`, data);
export const deleteAutomation = (id: string) => apiDelete(`/automations/${id}`);
export const toggleAutomation = (id: string) => apiPost<{ id: string; isActive: boolean }>(`/automations/${id}/toggle`, {});
export const testAutomation = (id: string) => apiPost<{ ok: boolean; result: any }>(`/automations/${id}/test`, {});
export const getAutomationExecutions = (id: string) => apiGet<any[]>(`/automations/${id}/executions`);

// ── Messages ──────────────────────────────────────────────────────────────────

// ── AI Prompts ────────────────────────────────────────────────────────────────

export interface AiPromptVariable {
  name: string;
  description: string;
  example?: string;
}

export interface AiPrompt {
  id: string;
  name: string;
  description?: string;
  category: string;
  prompt_text: string;
  variables: AiPromptVariable[];
  queue_ids: string[];
  provider: string;
  model: string;
  temperature: number;
  max_tokens: number;
  is_active: boolean;
  usage_count: number;
  created_at: string;
  updated_at: string;
}

export const getAiPrompts = (category?: string) =>
  apiGet<AiPrompt[]>(`/ai-prompts${category ? `?category=${category}` : ''}`);
export const getAiPromptCategories = () => apiGet<{ category: string; count: number }[]>('/ai-prompts/categories');
export const createAiPrompt = (data: Partial<AiPrompt>) => apiPost<AiPrompt>('/ai-prompts', data);
export const updateAiPrompt = (id: string, data: Partial<AiPrompt>) => apiPatch<AiPrompt>(`/ai-prompts/${id}`, data);
export const deleteAiPrompt = (id: string) => apiDelete(`/ai-prompts/${id}`);
export const duplicateAiPrompt = (id: string) => apiPost<AiPrompt>(`/ai-prompts/${id}/duplicate`, {});
export const runAiPrompt = (id: string, variables: Record<string, string>, conversationContext?: string) =>
  apiPost<{ result: string; filled_prompt: string; ai_generated: boolean; ai_error?: string | null; provider: string; model: string }>(
    `/ai-prompts/${id}/run`, { variables, conversationContext });

// ── AI Chatbots ───────────────────────────────────────────────────────────────

export interface AiChatbot {
  id: string;
  name: string;
  description?: string;
  status: 'active' | 'inactive' | 'draft';
  provider: 'openai' | 'anthropic' | 'gemini';
  model: string;
  system_prompt?: string;
  welcome_message?: string;
  fallback_message?: string;
  handoff_keyword?: string;
  handoff_message?: string;
  max_tokens: number;
  temperature: number;
  memory_conversations: number;
  inbox_ids: string[];
  queue_ids: string[];
  team_ids: string[];
  total_conversations: number;
  handoff_count: number;
  active_sessions?: number;
  sessions_today?: number;
  respond_in_groups?: boolean;
  webchat_enabled?: boolean;
  webchat_color?: string;
  webchat_title?: string;
  webchat_subtitle?: string;
  webchat_placeholder?: string;
  visual_config?: {
    emoji?: string;
    color?: string;
    businessName?: string;
    industry?: string;
    products?: string;
    tone?: string;
    language?: string;
    restrictions?: string;
    specialInstructions?: string;
  } | null;
  created_at: string;
  updated_at: string;
}

export interface AiChatbotStats {
  total_bots: number;
  active_bots: number;
  total_conversations: number;
  total_handoffs: number;
  byProvider: { provider: string; count: number }[];
  daily: { day: string; sessions: number; handoffs: number }[];
}

export const getAiChatbots = () => apiGet<AiChatbot[]>('/ai-chatbots');
export const getAiChatbotStats = () => apiGet<AiChatbotStats>('/ai-chatbots/stats');
export const createAiChatbot = (data: Partial<AiChatbot>) => apiPost<AiChatbot>('/ai-chatbots', data);
export const updateAiChatbot = (id: string, data: Partial<AiChatbot>) => apiPatch<AiChatbot>(`/ai-chatbots/${id}`, data);
export const deleteAiChatbot = (id: string) => apiDelete(`/ai-chatbots/${id}`);
export const toggleAiChatbot = (id: string) => apiPost<AiChatbot>(`/ai-chatbots/${id}/toggle`, {});
export const duplicateAiChatbot = (id: string) => apiPost<AiChatbot>(`/ai-chatbots/${id}/duplicate`, {});
export const getAiChatbotSessions = (id: string) => apiGet<any[]>(`/ai-chatbots/${id}/sessions`);
export const testAiChatbotMessage = (id: string, message: string) =>
  apiPost<{ reply: string | null; error?: string }>(`/ai-chatbots/${id}/test-message`, { message });

export const improveAiChatbotPrompt = (system_prompt: string) =>
  apiPost<{ improved: string }>('/ai-chatbots/improve-prompt', { system_prompt });

// ── Knowledge Base ────────────────────────────────────────────────────────────

export interface KnowledgeSource {
  id: string;
  type: 'url' | 'pdf';
  url?: string;
  file_name?: string;
  title?: string;
  status: 'pending' | 'indexing' | 'indexed' | 'error';
  error_message?: string;
  chunk_count: number;
  last_synced_at?: string;
  created_at: string;
}

export interface AllowedDomain {
  id: string;
  domain: string;
  created_at: string;
}

export const getKnowledgeSources  = (botId: string) => apiGet<KnowledgeSource[]>(`/ai-chatbots/${botId}/knowledge-sources`);
export const addKnowledgeUrl      = (botId: string, url: string) => apiPost<KnowledgeSource>(`/ai-chatbots/${botId}/knowledge-sources/url`, { url });
export const reindexKnowledgeSource = (botId: string, sourceId: string) => apiPost<void>(`/ai-chatbots/${botId}/knowledge-sources/${sourceId}/reindex`, {});
export const deleteKnowledgeSource  = (botId: string, sourceId: string) => apiDelete(`/ai-chatbots/${botId}/knowledge-sources/${sourceId}`);

export const addKnowledgePdf = async (botId: string, file: File): Promise<KnowledgeSource> => {
  const form = new FormData();
  form.append('file', file);
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const res = await fetch(`${API_URL}/ai-chatbots/${botId}/knowledge-sources/pdf`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}`, 'x-tenant-id': localStorage.getItem('tenantId') ?? '' } : {},
    body: form,
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message ?? 'Error uploading PDF'); }
  return res.json();
};

export const getCallBotKnowledgeSources   = (botId: string) => apiGet<KnowledgeSource[]>(`/call-bots/${botId}/knowledge-sources`);
export const addCallBotKnowledgeUrl       = (botId: string, url: string) => apiPost<KnowledgeSource>(`/call-bots/${botId}/knowledge-sources/url`, { url });
export const reindexCallBotKnowledgeSource = (botId: string, sourceId: string) => apiPost<void>(`/call-bots/${botId}/knowledge-sources/${sourceId}/reindex`, {});
export const deleteCallBotKnowledgeSource  = (botId: string, sourceId: string) => apiDelete(`/call-bots/${botId}/knowledge-sources/${sourceId}`);

export const addCallBotKnowledgePdf = async (botId: string, file: File): Promise<KnowledgeSource> => {
  const form = new FormData();
  form.append('file', file);
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const res = await fetch(`${API_URL}/call-bots/${botId}/knowledge-sources/pdf`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}`, 'x-tenant-id': localStorage.getItem('tenantId') ?? '' } : {},
    body: form,
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message ?? 'Error uploading PDF'); }
  return res.json();
};

export const getAllowedDomains  = () => apiGet<AllowedDomain[]>('/knowledge-base/domains');
export const addAllowedDomain   = (domain: string) => apiPost<AllowedDomain>('/knowledge-base/domains', { domain });
export const removeAllowedDomain = (id: string) => apiDelete(`/knowledge-base/domains/${id}`);

// ── Messages ──────────────────────────────────────────────────────────────────

export const getMessages = (conversationId: string) =>
  apiGet<Message[]>(`/conversations/${conversationId}/messages`);
export const sendMessage = (conversationId: string, body: string) =>
  apiPost<Message>(`/conversations/${conversationId}/messages`, { body, contentType: 'text', direction: 'outbound' });

export async function uploadMessageFile(conversationId: string, file: File, caption?: string): Promise<Message> {
  const formData = new FormData();
  formData.append('file', file);
  if (caption) formData.append('caption', caption);
  const res = await fetch(`${API_URL}/conversations/${conversationId}/messages/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getToken()}`, 'X-Tenant-ID': getTenantId() },
    body: formData,
  });
  return handleResponse(res);
}
export const getNotes = (conversationId: string) =>
  apiGet<Message[]>(`/conversations/${conversationId}/notes`);
export const sendNote = (conversationId: string, body: string) =>
  apiPost<Message>(`/conversations/${conversationId}/notes`, { body });

export interface ScheduledMessage {
  id: string;
  conversation_id: string;
  author_id: string;
  author_name?: string;
  body: string;
  scheduled_at: string;
  status: 'pending' | 'sent' | 'cancelled';
  created_at: string;
}
export const getScheduledMessages = (conversationId: string) =>
  apiGet<ScheduledMessage[]>(`/conversations/${conversationId}/messages/scheduled`);
export const scheduleMessage = (conversationId: string, body: string, scheduledAt: string) =>
  apiPost<ScheduledMessage>(`/conversations/${conversationId}/messages/schedule`, { body, scheduledAt });
export const cancelScheduledMessage = (conversationId: string, schedId: string) =>
  apiDelete(`/conversations/${conversationId}/messages/scheduled/${schedId}`);

// ── Real-time SSE ─────────────────────────────────────────────────────────────

/**
 * Opens a Server-Sent Events connection to /notifications/stream.
 * Returns an EventSource-like object; caller is responsible for closing it.
 * onEvent receives the parsed event data.
 * Returns the EventSource so the caller can close it.
 */
// ── Help Center ───────────────────────────────────────────────────────────────

export interface HelpCategory {
  id: string;
  name: string;
  icon: string;
  position: number;
  createdAt: string;
}

export interface HelpArticle {
  id: string;
  categoryId: string | null;
  title: string;
  body: string | null;
  videoUrl: string | null;
  position: number;
  isPublished: boolean;
  createdAt: string;
}

export interface HelpCategoryTree extends HelpCategory {
  articles: HelpArticle[];
}

export const getHelpTree       = (lang = 'es') => apiGet<HelpCategoryTree[]>(`/help/tree?lang=${lang}`);
export const getHelpCategories = () => apiGet<HelpCategory[]>('/help/categories');
export const createHelpCategory = (data: Partial<HelpCategory>) =>
  apiPost<HelpCategory>('/help/categories', data);
export const updateHelpCategory = (id: string, data: Partial<HelpCategory>) =>
  apiPatch<HelpCategory>(`/help/categories/${id}`, data);
export const deleteHelpCategory = (id: string) => apiDelete(`/help/categories/${id}`);

export const getHelpArticles   = (categoryId?: string) =>
  apiGet<HelpArticle[]>(`/help/articles${categoryId ? `?categoryId=${categoryId}` : ''}`);
export const getHelpArticle    = (id: string) => apiGet<HelpArticle>(`/help/articles/${id}`);
export const createHelpArticle = (data: Partial<HelpArticle>) =>
  apiPost<HelpArticle>('/help/articles', data);
export const updateHelpArticle = (id: string, data: Partial<HelpArticle>) =>
  apiPatch<HelpArticle>(`/help/articles/${id}`, data);
export const deleteHelpArticle = (id: string) => apiDelete(`/help/articles/${id}`);

// ── Integrations (external systems: Dentally, etc.) ────────────────────────────

export interface IntegrationCatalogItem { provider: string; label: string }
export interface TenantIntegration {
  provider: string;
  status: 'connected' | 'error';
  lastError?: string | null;
  region: string;
  hasToken: boolean;
  createdAt: string;
  updatedAt: string;
}
export const getIntegrationCatalog = () => apiGet<IntegrationCatalogItem[]>('/integrations/catalog');
export const getIntegrations = () => apiGet<TenantIntegration[]>('/integrations');
export const connectIntegration = (provider: string, config: Record<string, any>) =>
  apiPost<{ ok: boolean; info?: string }>(`/integrations/${provider}`, config);
export const testIntegration = (provider: string) =>
  apiPost<{ ok: boolean; info?: string; error?: string }>(`/integrations/${provider}/test`, {});
export const disconnectIntegration = (provider: string) => apiDelete(`/integrations/${provider}`);

// ── Admin: Tenant Management ──────────────────────────────────────────────────

export interface TenantAdmin {
  id: string;
  name: string;
  slug: string;
  plan: string;
  isActive: boolean;
  createdAt: string;
  userCount: number;
  contactCount: number;
  aiMessagesMonth: number;
  callSecondsMonth: number;
  // linked plan
  planId: string | null;
  planName: string | null;
  planColor: string | null;
  planSlug: string | null;
  planPrice: number | null;
  planCurrency: string | null;
  planBillingPeriod: string | null;
  // billing
  billingEmail: string | null;
  billingNotes: string | null;
  planExpiresAt: string | null;
  trialEndsAt: string | null;
  stripeSubscriptionStatus: string | null;
}

export interface TenantUser {
  id: string;
  fullName: string;
  email: string;
  role: string;
  isActive: boolean;
  availability: string;
  createdAt: string;
}

export const getAdminTenants = () => apiGet<TenantAdmin[]>('/auth/tenants');
export const getAdminTenantUsers = (tenantId: string) => apiGet<TenantUser[]>(`/auth/tenants/${tenantId}/users`);
export const createAdminTenant = (data: {
  name: string; slug: string; plan?: string;
  adminEmail: string; adminPassword: string; adminName?: string;
}) => apiPost<TenantAdmin>('/auth/tenants', data);
export const updateAdminTenant = (id: string, data: {
  name?: string; plan?: string; isActive?: boolean;
  planId?: string | null; billingEmail?: string; billingNotes?: string; planExpiresAt?: string | null;
}) => apiPatch<{ ok: boolean }>(`/auth/tenants/${id}`, data);
export const deleteAdminTenant = (id: string) => apiDelete(`/auth/tenants/${id}`);

// ── Templates por industria ───────────────────────────────────────────────────

export interface TemplateCallBot {
  name: string;
  language: string;
  voiceType: string;
  welcomeMessage: string;
  systemPrompt: string;
  fallbackMessage: string;
  handoffKeyword: string;
  maxCallDuration: number;
}

export interface IndustryTemplate {
  slug: string;
  name: string;
  description: string;
  icon: string;
  counts: { pipelines: number; tags: number; cannedResponses: number; queues: number; callBots: number };
  pipelines: { name: string; stages: string[] }[];
  tags: { name: string; color: string }[];
  cannedResponses: { title: string; shortCode: string; category: string; content: string }[];
  queues: { name: string; description: string }[];
  callBots: TemplateCallBot[];
}

export const getTemplates = () => apiGet<IndustryTemplate[]>('/templates');
export const applyTemplate = (slug: string) => apiPost<{ applied: Record<string, number> }>(`/templates/${slug}/apply`, {});

// ── Real-time SSE ─────────────────────────────────────────────────────────────

export function openNotificationsStream(
  onEvent: (data: Record<string, any>) => void,
  onError?: (e: Event) => void,
): EventSource {
  const url = `${API_URL}/notifications/stream`;
  const token = getToken();
  const tenantId = getTenantId();
  // SSE doesn't support custom headers; pass credentials via query params
  const qs = new URLSearchParams({ token, tenantId });
  const es = new EventSource(`${url}?${qs.toString()}`);
  es.onmessage = (e) => {
    try { onEvent(JSON.parse(e.data)); } catch { /* ignore */ }
  };
  if (onError) es.onerror = onError;
  return es;
}

// ── Global Search ─────────────────────────────────────────────────────────────

export interface SearchContact { id: string; full_name: string; email: string; phone: string; }
export interface SearchConversation { id: string; subject: string; status: string; channel_type: string; contact_name: string; }
export interface SearchDeal { id: string; title: string; value: number; currency: string; status: string; contact_name: string; }
export interface SearchResults { contacts: SearchContact[]; conversations: SearchConversation[]; deals: SearchDeal[]; }

export const globalSearch = (q: string) => apiGet<SearchResults>(`/search?q=${encodeURIComponent(q)}`);

// ── Contact Timeline ──────────────────────────────────────────────────────────

export interface TimelineConversation { id: string; status: string; channel_type: string; subject: string; created_at: string; last_message: string; }
export interface TimelineDeal { id: string; title: string; value: number; currency: string; status: string; stage_name: string; created_at: string; }
export interface TimelineTask { id: string; title: string; status: string; priority: string; due_date: string; created_at: string; }
export interface ContactTimeline { conversations: TimelineConversation[]; deals: TimelineDeal[]; tasks: TimelineTask[]; }

export const getContactTimeline = (contactId: string) =>
  apiGet<ContactTimeline>(`/contacts/${contactId}/timeline`);

// ── Content ───────────────────────────────────────────────────────────────────

export interface ContentPost {
  id: string;
  tenantId: string;
  title: string;
  body?: string;
  status: 'draft' | 'pending_review' | 'approved' | 'published';
  channel: string;
  tags: string[];
  coverUrl?: string;
  scheduledAt?: string;
  publishedAt?: string;
  authorId?: string;
  authorName?: string;
  assignedTo?: string;
  assignedTeam?: string;
  mediaUrl?: string;
  mediaType?: string;
  altText?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export const getContentPosts = (params?: { status?: string; channel?: string }) => {
  const q = new URLSearchParams();
  if (params?.status)  q.set('status',  params.status);
  if (params?.channel) q.set('channel', params.channel);
  return apiGet<ContentPost[]>(`/content${q.toString() ? `?${q}` : ''}`);
};

export const getContentPost  = (id: string) => apiGet<ContentPost>(`/content/${id}`);

export const createContentPost = (data: Partial<ContentPost>) =>
  apiPost<ContentPost>('/content', data);

export const updateContentPost = (id: string, data: Partial<ContentPost>) =>
  apiPatch<ContentPost>(`/content/${id}`, data);

export const deleteContentPost = (id: string) => apiDelete(`/content/${id}`);

export const generateContentPost = (data: { title: string; channel: string; keywords?: string; tone?: string; promptId?: string }) =>
  apiPost<{ body: string; aiGenerated: boolean; promptName?: string }>('/content/generate', data);

export const getContentPostSchedule = (id: string) =>
  apiGet<{ scheduled: boolean; state?: string; runAt?: string | null }>(`/content/${id}/schedule`);

export const generateContentImage = (data: { prompt: string; provider?: string; size?: string; style?: string; contentPostId?: string }) =>
  apiPost<{ url: string; id: string; costUsd: number; provider: string }>('/content/generate-image', data);

export const getContentImageHistory = () =>
  apiGet<AiImageGeneration[]>('/content/image-gen/history');

export const getContentImageUsage = () =>
  apiGet<{ used: number; limit: number; hasAccess: boolean; availableProviders: string[] }>('/content/image-gen/usage');

export const uploadContentMedia = async (file: File): Promise<{ url: string; mediaType: string }> => {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_URL}/content/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${localStorage.getItem('token') ?? ''}`,
      'X-Tenant-ID': localStorage.getItem('tenantId') ?? '',
    },
    body: form,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
};

// ── Voice Catalog ─────────────────────────────────────────────────────────────

export interface Voice {
  id: string;
  name: string;
  description?: string;
  language: string;
  gender: string;
  ttsProvider: string;
  ttsVoiceId?: string;
  isActive: boolean;
  sortOrder: number;
}

export const getVoices = () => apiGet<Voice[]>('/voices');
export const createVoice = (data: Omit<Voice, 'id'>) => apiPost<Voice>('/voices', data);
export const updateVoice = (id: string, data: Partial<Omit<Voice, 'id'>>) =>
  apiPatch<Voice>(`/voices/${id}`, data);
export const deleteVoice = (id: string) => apiDelete(`/voices/${id}`);
