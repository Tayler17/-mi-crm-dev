import { Injectable } from '@nestjs/common';
import * as https from 'https';
import { IntegrationConnector, ExternalContact, Practitioner, AvailabilitySlot, BookAppointmentInput, BookedAppointment, WebhookEvent } from './connector.interface';

/** Region → API host. Default is the global/UK cluster. */
const HOSTS: Record<string, string> = {
  global:  'api.dentally.co',
  uk:      'api.dentally.co',
  apac:    'api.apac.dentally.com',
  ca:      'api.ca.dentally.com',
  sandbox: 'api.sandbox.dentally.co',
};

@Injectable()
export class DentallyConnector implements IntegrationConnector {
  readonly provider = 'dentally';
  readonly label = 'Dentally';

  private host(config: Record<string, any>): string {
    return HOSTS[(config?.region || 'global').toLowerCase()] || HOSTS.global;
  }

  /** Build a normalized "external contact" from a Dentally patient record. */
  private mapPatient(p: any): ExternalContact | null {
    if (!p) return null;
    const fullName = [p.first_name, p.last_name].filter(Boolean).join(' ').trim()
      || p.email_address || `Paciente ${p.id}`;
    const phone = p.mobile_phone || p.home_phone || p.work_phone || '';
    const location = [p.address_line_1, p.town, p.postcode, p.country].filter(Boolean).join(', ');
    return {
      externalId: String(p.id),
      fullName,
      email: (p.email_address || '').trim() || undefined,
      phone: (phone || '').trim() || undefined,
      location: location || undefined,
    };
  }

  /** Phase 2: pull all patients (paginated, capped) normalized to ExternalContact. */
  async listPatients(config: Record<string, any>, opts?: { perPage?: number; maxPages?: number }): Promise<ExternalContact[]> {
    const token = (config?.token || '').trim();
    if (!token) throw new Error('Falta el token de API de Dentally.');
    const host = this.host(config);
    const perPage = Math.min(opts?.perPage ?? 100, 100);
    const maxPages = opts?.maxPages ?? 100; // safety cap ~10k patients
    const out: ExternalContact[] = [];

    for (let page = 1; page <= maxPages; page++) {
      const res = await this.request(host, token, `/v1/patients?per_page=${perPage}&page=${page}`);
      if (res.status === 401 || res.status === 403) throw new Error('Token inválido o sin permisos para leer pacientes.');
      if (res.status >= 400) throw new Error(`Dentally respondió ${res.status} al listar pacientes.`);
      const patients: any[] = Array.isArray(res.json?.patients) ? res.json.patients : [];
      for (const p of patients) {
        const c = this.mapPatient(p);
        if (c) out.push(c);
      }
      // Stop when fewer than a full page came back, or pagination says we're done.
      const pag = res.json?.meta?.pagination;
      if (patients.length < perPage) break;
      if (pag && pag.current_page && pag.total_pages && pag.current_page >= pag.total_pages) break;
    }
    return out;
  }

  /**
   * Phase 4: normalize a Dentally webhook payload to a common event.
   * Best-effort — Dentally sends events like { event: 'patient_insertion',
   * patient: {...} } or { event: 'appointment_insertion', appointment: {...} }.
   * Confirm exact names/shape against real deliveries and adjust here.
   */
  /** Find one existing patient by email or phone (tolerant — returns null if none/unsupported). */
  async findPatient(config: Record<string, any>, q: { email?: string; phone?: string }): Promise<ExternalContact | null> {
    const token = (config?.token || '').trim();
    if (!token) throw new Error('Falta el token de API de Dentally.');
    const host = this.host(config);
    const norm = (s?: string) => (s || '').toLowerCase().trim();

    const tryQuery = async (qs: string): Promise<any[]> => {
      const res = await this.request(host, token, `/v1/patients?per_page=50&${qs}`);
      if (res.status >= 400) return [];
      return Array.isArray(res.json?.patients) ? res.json.patients : [];
    };

    let patients: any[] = [];
    if (q.email) patients = await tryQuery(`filters[email_address]=${encodeURIComponent(q.email)}`);
    if (!patients.length && q.phone) patients = await tryQuery(`filters[mobile_phone]=${encodeURIComponent(q.phone)}`);

    const match = patients.find((p) =>
      (q.email && norm(p.email_address) === norm(q.email)) ||
      (q.phone && (p.mobile_phone === q.phone || p.home_phone === q.phone || p.work_phone === q.phone)),
    ) || (patients.length === 1 ? patients[0] : null);

    return match ? this.mapPatient(match) : null;
  }

  /** The practice's default payment plan id (Dentally requires one to create a patient). */
  private async defaultPaymentPlanId(host: string, token: string): Promise<string | undefined> {
    const res = await this.request(host, token, '/v1/payment_plans?per_page=100');
    if (res.status >= 400) return undefined;
    const plans: any[] = Array.isArray(res.json?.payment_plans) ? res.json.payment_plans : [];
    const chosen = plans.find((p) => p.default) || plans.find((p) => p.active !== false) || plans[0];
    return chosen ? String(chosen.id) : undefined;
  }

  /** Create a patient in Dentally. Auto-resolves the default payment plan; surfaces validation errors. */
  async createPatient(
    config: Record<string, any>,
    p: { firstName?: string; lastName?: string; email?: string; phone?: string; title?: string; dateOfBirth?: string; gender?: string },
  ): Promise<ExternalContact> {
    const token = (config?.token || '').trim();
    if (!token) throw new Error('Falta el token de API de Dentally.');
    const host = this.host(config);
    const paymentPlanId = await this.defaultPaymentPlanId(host, token);
    if (!paymentPlanId) throw new Error('La clínica no tiene un plan de pago configurado en Dentally.');
    const body = {
      patient: {
        title: p.title || undefined,
        first_name: p.firstName || 'Paciente',
        last_name: p.lastName || 'CRM',
        date_of_birth: p.dateOfBirth || undefined,
        gender: (p.gender || '').toLowerCase() || undefined,
        payment_plan_id: paymentPlanId,
        email_address: p.email || undefined,
        mobile_phone: p.phone || undefined,
      },
    };
    const res = await this.request(host, token, '/v1/patients', 'POST', body);
    if (res.status === 422) {
      const msg = JSON.stringify(res.json?.error || res.json?.errors || res.json).slice(0, 300);
      throw new Error(`Dentally rechazó crear el paciente: ${msg}`);
    }
    if (res.status >= 400) throw new Error(`Dentally ${res.status} al crear el paciente.`);
    const created = this.mapPatient(res.json?.patient ?? res.json);
    if (!created) throw new Error('Dentally no devolvió el paciente creado.');
    return created;
  }

  normalizeWebhook(payload: any): WebhookEvent | null {
    if (!payload) return null;
    const event = String(payload.event || payload.type || '').toLowerCase();

    // Patient created/updated → upsert a CRM contact.
    const patient = payload.patient || (event.includes('patient') ? payload.data : undefined);
    if (patient && (event.includes('patient') || event === '')) {
      const c = this.mapPatient(patient);
      if (c) return { type: 'contact', contact: c, raw: payload };
    }

    // Appointment events → logged for now (see service).
    if (event.includes('appointment') || payload.appointment) {
      return { type: 'appointment', raw: payload };
    }

    return { type: 'other', raw: payload };
  }

  /** Authenticated request against the Dentally API. Always sends a User-Agent (required → 403 without it). */
  private request(host: string, token: string, path: string, method = 'GET', body?: any): Promise<{ status: number; json: any }> {
    return new Promise((resolve, reject) => {
      const payload = body ? JSON.stringify(body) : undefined;
      const req = https.request(
        {
          hostname: host,
          path,
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            'User-Agent': 'AutoMarkIQ-CRM/1.0',
            Accept: 'application/json',
            ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
          },
          timeout: 15_000,
        },
        (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => {
            let json: any = {};
            try { json = data ? JSON.parse(data) : {}; } catch { json = { raw: data }; }
            resolve({ status: res.statusCode ?? 0, json });
          });
        },
      );
      req.on('error', reject);
      req.on('timeout', () => req.destroy(new Error('Dentally request timeout')));
      if (payload) req.write(payload);
      req.end();
    });
  }

  /** Phase 3: list practitioners (for choosing who the appointment is with). */
  async listPractitioners(config: Record<string, any>): Promise<Practitioner[]> {
    const token = (config?.token || '').trim();
    if (!token) throw new Error('Falta el token de API de Dentally.');
    const res = await this.request(this.host(config), token, '/v1/practitioners?per_page=100&active=true');
    if (res.status === 401 || res.status === 403) throw new Error('Token inválido o sin permisos para leer profesionales.');
    if (res.status >= 400) throw new Error(`Dentally respondió ${res.status} al listar profesionales.`);
    const list: any[] = Array.isArray(res.json?.practitioners) ? res.json.practitioners : [];
    return list.map((p) => ({
      id: String(p.id),
      name: [p.user?.title, p.user?.first_name, p.user?.last_name].filter(Boolean).join(' ').trim()
        || p.name || `Profesional ${p.id}`,
    }));
  }

  /** Phase 3: open appointment slots for a practitioner over a date range. */
  async listAvailability(
    config: Record<string, any>,
    opts: { practitionerId: string; startDate: string; finishDate: string; durationMinutes?: number },
  ): Promise<AvailabilitySlot[]> {
    const token = (config?.token || '').trim();
    if (!token) throw new Error('Falta el token de API de Dentally.');
    const duration = opts.durationMinutes ?? 30;
    // Dentally requires the search window to span MORE than 24 hours. A single-day
    // request (00:00–23:59) is just under 24h and gets rejected, so we widen the
    // window sent to Dentally and filter the results back to the requested range.
    const now = Date.now();
    let startMs = Date.parse(opts.startDate);
    if (isNaN(startMs)) startMs = now;
    // Dentally requires start_time in the future — for "today" (00:00 is already
    // past) clamp to now + a couple of minutes.
    if (startMs <= now) startMs = now + 2 * 60 * 1000;
    const reqFinishMs = Date.parse(opts.finishDate);
    const minFinishMs = startMs + 24 * 60 * 60 * 1000 + 60 * 1000; // start + 24h + 1min
    const finishTime = (!isNaN(reqFinishMs) && reqFinishMs > minFinishMs)
      ? opts.finishDate
      : new Date(minFinishMs).toISOString();
    const qs = new URLSearchParams({
      start_time: new Date(startMs).toISOString(),
      finish_time: finishTime,
      duration: String(duration),
    });
    qs.append('practitioner_ids[]', String(opts.practitionerId));
    const res = await this.request(this.host(config), token, `/v1/appointments/availability?${qs.toString()}`);
    if (res.status === 401 || res.status === 403) throw new Error('Token inválido o sin permisos para ver disponibilidad.');
    if (res.status >= 400) {
      const blob = JSON.stringify(res.json || {}).toLowerCase();
      if (blob.includes('must be in the future')) throw new Error('La fecha debe ser futura. Elige hoy a una hora próxima o un día siguiente.');
      throw new Error('No se pudo consultar la disponibilidad en Dentally. Revisa la fecha e inténtalo de nuevo.');
    }
    const slots: any[] = Array.isArray(res.json?.availability) ? res.json.availability : [];
    const mapped = slots.map((s) => ({
      start: s.start_time,
      finish: s.finish_time,
      practitionerId: s.practitioner_id != null ? String(s.practitioner_id) : String(opts.practitionerId),
    }));
    // Keep only slots within the day the user actually asked for.
    if (isNaN(reqFinishMs)) return mapped;
    return mapped.filter((s) => {
      const t = Date.parse(s.start);
      return isNaN(t) || t <= reqFinishMs;
    });
  }

  /** Phase 3: create an appointment in Dentally. */
  async createAppointment(config: Record<string, any>, appt: BookAppointmentInput): Promise<BookedAppointment> {
    const token = (config?.token || '').trim();
    if (!token) throw new Error('Falta el token de API de Dentally.');
    const body = {
      appointment: {
        patient_id: Number(appt.patientExternalId) || appt.patientExternalId,
        practitioner_id: Number(appt.practitionerId) || appt.practitionerId,
        start_time: appt.start,
        finish_time: appt.finish,
        reason: appt.reason || 'Cita agendada vía AutoMarkIQ',
      },
    };
    const res = await this.request(this.host(config), token, '/v1/appointments', 'POST', body);
    if (res.status === 401 || res.status === 403) throw new Error('Token inválido o sin permisos para crear citas.');
    if (res.status === 422) {
      const msg = res.json?.error || JSON.stringify(res.json?.errors || res.json);
      throw new Error(`Dentally rechazó la cita: ${msg}`);
    }
    if (res.status >= 400) throw new Error(`Dentally respondió ${res.status} al crear la cita.`);
    const a = res.json?.appointment ?? res.json;
    return { id: String(a?.id ?? ''), start: a?.start_time ?? appt.start, finish: a?.finish_time ?? appt.finish };
  }

  async testConnection(config: Record<string, any>): Promise<{ ok: boolean; info?: string; error?: string }> {
    const token = (config?.token || '').trim();
    if (!token) return { ok: false, error: 'Falta el token de API de Dentally.' };
    const host = this.host(config);
    try {
      // Cheapest authenticated call: current user. Falls back to a 1-item patient list.
      let res = await this.request(host, token, '/v1/users/current');
      if (res.status === 404) res = await this.request(host, token, '/v1/patients?per_page=1');

      if (res.status === 401 || res.status === 403) {
        return { ok: false, error: 'Token inválido o sin permisos. Revisa el token y los scopes en Dentally.' };
      }
      if (res.status >= 400) {
        return { ok: false, error: `Dentally respondió ${res.status}.` };
      }
      const name = res.json?.user?.first_name
        ? `${res.json.user.first_name} ${res.json.user.last_name ?? ''}`.trim()
        : undefined;
      return { ok: true, info: name ? `Conectado como ${name}` : 'Conexión correcta' };
    } catch (e: any) {
      return { ok: false, error: `No se pudo conectar con Dentally: ${e.message}` };
    }
  }
}
