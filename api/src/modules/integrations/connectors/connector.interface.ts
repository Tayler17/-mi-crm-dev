/**
 * A pluggable connector to an external practice-management / scheduling system
 * (Dentally first; Cliniko, Acuity, etc. later). Each tenant connects its own
 * account. Phase 1 only needs testConnection; later phases add the rest.
 */
export interface IntegrationConnector {
  /** Stable provider key, e.g. 'dentally'. */
  readonly provider: string;
  /** Human label shown in the UI. */
  readonly label: string;

  /** Validate the tenant's credentials. Returns ok + optional account info or error. */
  testConnection(config: Record<string, any>): Promise<{ ok: boolean; info?: string; error?: string }>;

  // ── Later phases (optional until implemented) ──────────────────────────────
  /** Phase 2: pull patients/customers to sync as CRM contacts. */
  listPatients?(config: Record<string, any>, opts?: { page?: number; perPage?: number }): Promise<any[]>;
  /** Phase 3: open slots for a date range / practitioner. */
  listAvailability?(config: Record<string, any>, opts: any): Promise<any[]>;
  /** Phase 3: create an appointment in the external system. */
  createAppointment?(config: Record<string, any>, appt: any): Promise<any>;
}
