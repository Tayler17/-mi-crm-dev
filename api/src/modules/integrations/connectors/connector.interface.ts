/** Provider-agnostic contact shape returned by listPatients (Phase 2). */
export interface ExternalContact {
  externalId: string;
  fullName: string;
  email?: string;
  phone?: string;
  location?: string;
}

/** A bookable professional in the external system (Phase 3). */
export interface Practitioner { id: string; name: string; }

/** An open appointment slot (Phase 3). ISO 8601 times. */
export interface AvailabilitySlot { start: string; finish?: string; practitionerId?: string; }

/** Input to create an appointment (Phase 3). */
export interface BookAppointmentInput {
  patientExternalId: string;
  practitionerId: string;
  start: string;
  finish?: string;
  reason?: string;
}

/** Result of a successful booking (Phase 3). */
export interface BookedAppointment { id: string; start: string; finish?: string; }

/** A normalized inbound webhook event (Phase 4). */
export interface WebhookEvent {
  /** 'contact' upserts a CRM contact; other types are logged for now. */
  type: 'contact' | 'appointment' | 'other';
  contact?: ExternalContact;
  raw?: any;
}

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
  listPatients?(config: Record<string, any>, opts?: { perPage?: number; maxPages?: number }): Promise<ExternalContact[]>;
  /** Find a single existing patient by email/phone (for on-demand linking). Null if none. */
  findPatient?(config: Record<string, any>, q: { email?: string; phone?: string }): Promise<ExternalContact | null>;
  /** Create a patient in the external system (for on-demand linking when not found). */
  createPatient?(config: Record<string, any>, p: { firstName?: string; lastName?: string; email?: string; phone?: string }): Promise<ExternalContact>;
  /** Phase 3: bookable professionals. */
  listPractitioners?(config: Record<string, any>): Promise<Practitioner[]>;
  /** Phase 3: open slots for a date range / practitioner. */
  listAvailability?(
    config: Record<string, any>,
    opts: { practitionerId: string; startDate: string; finishDate: string; durationMinutes?: number },
  ): Promise<AvailabilitySlot[]>;
  /** Phase 3: create an appointment in the external system. */
  createAppointment?(config: Record<string, any>, appt: BookAppointmentInput): Promise<BookedAppointment>;

  /** Phase 4: normalize an inbound webhook payload to a common event (null = ignore). */
  normalizeWebhook?(payload: any): WebhookEvent | null;
}
