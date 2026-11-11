// Per-workspace + per-user localStorage key for the Business Assistant chat history.
// The assistant backend is stateless (keeps no history), so the conversation lives
// only in the browser. A single GLOBAL key leaked the conversation across workspaces
// and users sharing the same browser — this scopes it to the active tenant + user.
// Both the /ai-assistant page and the floating BusinessAssistantFab import this so
// they stay in sync within a workspace and never bleed across them.

export const LEGACY_ASSISTANT_KEY = 'aiAssistantChat';

export function assistantStorageKey(): string {
  try {
    const tid = localStorage.getItem('tenantId') || 'na';
    let uid = 'na';
    try { uid = JSON.parse(localStorage.getItem('user') || '{}').id || 'na'; } catch { /* ignore */ }
    return `aiAssistantChat:${tid}:${uid}`;
  } catch {
    return 'aiAssistantChat:na:na';
  }
}
