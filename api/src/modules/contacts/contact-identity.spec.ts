import {
  resolveInboundWhatsAppName,
  canAgentUseContactName,
  agentAddressableName,
} from './contact-identity';

describe('contact-identity', () => {
  describe('resolveInboundWhatsAppName', () => {
    it('CASE 1: keeps a WhatsApp display name but never as a verified name', () => {
      const r = resolveInboundWhatsAppName('Mami ❤️', '447700900000');
      expect(r.displayName).toBe('Mami ❤️');
      expect(r.nameSource).toBe('whatsapp'); // stored as WhatsApp source, NOT verified
    });

    it('CASE 2: a plain-looking WhatsApp name is still only "whatsapp" source', () => {
      const r = resolveInboundWhatsAppName('Juan', '447700900001');
      expect(r.displayName).toBe('Juan');
      expect(r.nameSource).toBe('whatsapp');
    });

    it('treats a name equal to the phone number as no display name', () => {
      const r = resolveInboundWhatsAppName('447700900002', '447700900002');
      expect(r.displayName).toBeNull();
      expect(r.nameSource).toBe('unknown');
    });

    it('handles missing/blank names', () => {
      expect(resolveInboundWhatsAppName(undefined, '999').displayName).toBeNull();
      expect(resolveInboundWhatsAppName('   ', '999').nameSource).toBe('unknown');
    });
  });

  describe('canAgentUseContactName', () => {
    it('CASE 2: does not allow using an unverified name', () => {
      expect(canAgentUseContactName({ name_verified: false })).toBe(false);
      expect(canAgentUseContactName({ nameVerified: false })).toBe(false);
      expect(canAgentUseContactName({})).toBe(false);
    });

    it('CASE 3/5: allows using a verified name', () => {
      expect(canAgentUseContactName({ name_verified: true })).toBe(true);
      expect(canAgentUseContactName({ nameVerified: true })).toBe(true);
    });
  });

  describe('agentAddressableName', () => {
    it('CASE 1/2: returns null when the name is not verified (WhatsApp display name)', () => {
      expect(agentAddressableName({ full_name: 'Mami ❤️', name_verified: false })).toBeNull();
      expect(agentAddressableName({ fullName: 'Juan', nameVerified: false })).toBeNull();
    });

    it('CASE 3: returns the confirmed name once verified', () => {
      expect(agentAddressableName({ full_name: 'José Martínez', name_verified: true })).toBe('José Martínez');
      expect(agentAddressableName({ fullName: 'José Martínez', nameVerified: true })).toBe('José Martínez');
    });

    it('returns null for a verified-but-empty name', () => {
      expect(agentAddressableName({ full_name: '  ', name_verified: true })).toBeNull();
    });
  });
});
