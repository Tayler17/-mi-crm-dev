/**
 * Contact identity — a small, pure, tested layer shared by the WhatsApp inbound handler
 * and the AI chatbot engine so the "name" rules live in ONE place.
 *
 * Core idea: a name arriving from a channel (e.g. the WhatsApp profile name) is only a
 * DISPLAY name. It must never be treated as the customer's real name until it is verified.
 */

export type NameSource = 'customer' | 'agent' | 'import' | 'whatsapp' | 'unknown';

/**
 * From an inbound WhatsApp message decide the display name and its source.
 * WhatsApp gives a "name" that may just echo the phone number when no profile name is set;
 * in that case there is no usable display name.
 */
export function resolveInboundWhatsAppName(
  contactName: string | null | undefined,
  contactPhone: string,
): { displayName: string | null; nameSource: NameSource } {
  const nm = (contactName ?? '').trim();
  const hasDisplay = !!nm && nm !== (contactPhone ?? '').trim();
  return { displayName: hasDisplay ? nm : null, nameSource: hasDisplay ? 'whatsapp' : 'unknown' };
}

/**
 * May an AI agent address the customer by their stored name?
 * Only when the name has been verified (by the customer or a human agent).
 */
export function canAgentUseContactName(contact: {
  nameVerified?: boolean | null;
  name_verified?: boolean | null;
}): boolean {
  return (contact.nameVerified ?? contact.name_verified) === true;
}

/**
 * Returns the name an AI agent is allowed to use to address the customer, or null when it
 * must not use any stored name yet.
 */
export function agentAddressableName(contact: {
  fullName?: string | null;
  full_name?: string | null;
  nameVerified?: boolean | null;
  name_verified?: boolean | null;
}): string | null {
  if (!canAgentUseContactName(contact)) return null;
  const name = (contact.fullName ?? contact.full_name ?? '').trim();
  return name || null;
}
