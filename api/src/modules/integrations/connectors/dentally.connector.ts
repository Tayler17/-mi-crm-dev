import { Injectable } from '@nestjs/common';
import * as https from 'https';
import { IntegrationConnector, ExternalContact, Practitioner, AvailabilitySlot, BookAppointmentInput, BookedAppointment } from './connector.interface';

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
    const qs = new URLSearchParams({
      start_time: opts.startDate,
      finish_time: opts.finishDate,
      duration: String(duration),
    });
    qs.append('practitioner_ids[]', String(opts.practitionerId));
    const res = await this.request(this.host(config), token, `/v1/appointments/availability?${qs.toString()}`);
    if (res.status === 401 || res.status === 403) throw new Error('Token inválido o sin permisos para ver disponibilidad.');
    if (res.status >= 400) throw new Error(`Dentally respondió ${res.status} al consultar disponibilidad.`);
    const slots: any[] = Array.isArray(res.json?.availability) ? res.json.availability : [];
    return slots.map((s) => ({
      start: s.start_time,
      finish: s.finish_time,
      practitionerId: s.practitioner_id != null ? String(s.practitioner_id) : String(opts.practitionerId),
    }));
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
