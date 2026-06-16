# Integraciones (conectores a sistemas externos)

Framework extensible para conectar **AutoMarkIQ** con sistemas que ya usan los
clientes (gestión de clínicas, agendas, etc.). Cada tenant conecta **su propia**
cuenta con su token; las credenciales se guardan por tenant y nunca se devuelven
al frontend.

El primer conector es **Dentally** (software de clínicas dentales). El diseño es
agnóstico del proveedor: agregar otro sistema (Cliniko, Acuity, etc.) es crear un
archivo `*.connector.ts` que implemente la interfaz y registrarlo — toda la UI,
sincronización, agenda y webhooks ya funcionan para él.

---

## 1. Qué hace (fases)

| Fase | Función | Endpoint principal |
|---|---|---|
| 1 | **Conectar**: validar token + región y guardarlos por tenant | `POST /integrations/:provider` |
| 2 | **Sincronizar pacientes → contactos** (con deduplicación) | `POST /integrations/:provider/sync` |
| 3 | **Agendar citas** con disponibilidad real | `GET …/practitioners`, `GET …/availability`, `POST …/appointments` |
| 4 | **Webhooks** (opcional): sync de pacientes en tiempo real | `POST /integrations/:provider/webhook/:secret` (público) |
| — | **Auto-sync (modelo token-only)**: cron cada 15 min | `POST /integrations/:provider/auto-sync` |

**Modelo recomendado: token-only.** El cliente solo entrega un token. Con la
**sincronización automática** activada, el CRM consulta el sistema cada 15 min y
mantiene los contactos al día sin que el cliente pegue nada en su sistema. El
webhook es un extra opcional para quien quiera actualización instantánea.

---

## 2. Arquitectura

```
web/src/app/(protected)/integrations/page.tsx   ← UI (catálogo, conectar, sync, agenda, webhook, auto-sync)
web/src/lib/api.ts                               ← funciones cliente (getIntegrations, syncIntegration, …)

api/src/modules/integrations/
├── connectors/
│   ├── connector.interface.ts      ← IntegrationConnector + tipos comunes (ExternalContact, Practitioner, …)
│   └── dentally.connector.ts       ← conector Dentally (HTTP, mapeos, parseo de webhook)
├── integrations.service.ts         ← lógica + tablas + cron de auto-sync
├── integrations.controller.ts      ← rutas autenticadas (JwtAuthGuard, escritura solo admin/owner)
├── integrations-webhook.controller.ts  ← receptor público de webhooks (sin auth; secret en la URL)
└── integrations.module.ts
```

### Tablas (creadas solas en `onModuleInit`)

- **`tenant_integrations`** — `(tenant_id, provider)` único. `config` (jsonb) guarda
  `token`, `region`, `autoSync`, `lastSyncAt`, `webhookSecret`. `status` =
  `connected` | `error`; `last_error` con el último mensaje.
- **`integration_contact_map`** — `(tenant_id, provider, external_id)` único →
  `contact_id`. Mapea cada paciente externo a un contacto del CRM para que las
  re-sincronizaciones **actualicen** en vez de duplicar.

### Deduplicación al sincronizar (`upsertExternalContact`)

1. ¿Ya hay mapeo `external_id → contact_id`? → actualiza ese contacto.
2. Si no, ¿hay un contacto con el mismo **email o teléfono** en el tenant? → lo
   enlaza y actualiza.
3. Si no, **crea** un contacto nuevo (nota "Importado de …").
4. Registra/refresca el mapeo.

Compartido por el sync masivo (Fase 2) y por los webhooks (Fase 4).

---

## 3. Conector Dentally — detalles

- **Hosts por región** (`HOSTS` en `dentally.connector.ts`):
  - `global` / `uk` → `api.dentally.co`
  - `apac` → `api.apac.dentally.com`
  - `ca` → `api.ca.dentally.com`
  - `sandbox` → `api.sandbox.dentally.co`
- **Auth**: header `Authorization: Bearer <token>` + **`User-Agent` obligatorio**
  (Dentally responde 403 sin él).
- **Endpoints usados**: `/v1/users/current` (test), `/v1/patients` (sync, paginado
  100/pág, tope 100 páginas), `/v1/practitioners`, `/v1/appointments/availability`,
  `POST /v1/appointments`.
- **Guías de la API de Dentally** (developer.dentally.co): usar filtros, no pedir
  >3 meses de citas, no paginar más allá de la página 100, usar filtros de fecha
  cuando existan.

### ⚠️ Pendiente de confirmar con un token real (marcado con comentarios en el código)

- Nombres exactos de campos de paciente/profesional/disponibilidad.
- Formato real de los eventos de webhook (`event: 'patient_insertion'`, etc.) y si
  Dentally manda firma/secret propio para verificar.
- Si la creación de cita exige `room_id` (algunas clínicas lo requieren → 422).
- Filtro `updated_since` para que el auto-sync sea incremental (más liviano).

---

## 4. Cómo agregar un nuevo conector

1. Crear `api/src/modules/integrations/connectors/<sistema>.connector.ts`:
   ```ts
   @Injectable()
   export class FooConnector implements IntegrationConnector {
     readonly provider = 'foo';
     readonly label = 'Foo';
     async testConnection(config) { /* validar credenciales */ }
     async listPatients?(config)   { /* → ExternalContact[] (opcional) */ }
     async listPractitioners?(config) { /* opcional */ }
     async listAvailability?(config, opts) { /* opcional */ }
     async createAppointment?(config, appt) { /* opcional */ }
     normalizeWebhook?(payload) { /* → WebhookEvent | null (opcional) */ }
   }
   ```
2. Registrarlo en `integrations.module.ts` (providers) y en el `constructor` del
   service (`[this.dentally, this.foo].forEach(...)`).
3. (Frontend) Añadir su entrada a `PROVIDER_META` en `page.tsx` (emoji + ayuda).

La UI, el sync, la agenda, el auto-sync y los webhooks funcionan automáticamente
según qué métodos opcionales implemente el conector.

---

## 5. Configuración / entorno

- **`API_PUBLIC_URL`** (prod: `https://api.automarkiq.com`) — base de la URL de
  webhook que se le muestra al cliente.
- Roles: leer/listar = cualquier usuario autenticado; conectar/sync/agendar/
  webhook/auto-sync = **admin u owner** (rol `agent` bloqueado).

---

## 6. Qué pedirle a cada clínica

1. Un **token de API** generado por ellos en su sistema:
   - Dentally: **Settings → Developer Settings → Generate new token**.
   - Scopes: `patient:read`, `appointment:read` (y `appointment:write` si van a
     agendar desde el CRM).
2. La **región** de su cuenta (UK/Global, APAC, Canadá).

Notas Dentally:
- "Integrations" está en los 3 planes (Starter/Essentials/Pro). El acceso API no
  exige el plan más caro; algunas licencias necesitan que Dentally habilite la
  pantalla *Developer Settings* (pedido al soporte de Dentally).
- Los tokens **se desactivan si no se usan en 2 semanas** → el auto-sync los
  mantiene vivos.
- Sandbox de pruebas: pedir acceso read-only vía el formulario Partner/Developer
  de Dentally, o que una clínica piloto emita un token read-only.

---

## 7. Despliegue

Toca backend + frontend, así que:

```bash
cd /opt/crm && git pull && docker compose up -d --build web && docker compose up -d --force-recreate api
```

(`--build web` es obligatorio: el frontend corre desde imagen pre-construida. Ver `DEPLOY.md`.)

---

## 8. Troubleshooting

| Síntoma | Causa probable | Acción |
|---|---|---|
| "Token inválido o sin permisos" | token mal copiado o sin scopes | regenerar con `patient:read`/`appointment:read` |
| Conexión OK pero sync trae 0 | región equivocada o cuenta sin pacientes | revisar región; probar Sandbox |
| 403 en todas las llamadas | falta `User-Agent` (ya lo enviamos) o token revocado | verificar token vigente |
| Cita rechazada (422) | falta `room_id` u otro campo obligatorio | ver mensaje exacto → añadir campo al conector |
| Webhook no entra | URL mal pegada o secret regenerado | volver a copiar la URL del panel 🔔 |
| Auto-sync no corre | `autoSync` apagado o `status='error'` | activar el check; revisar `last_error` |

Logs útiles: `docker logs crm_api --tail 80 | grep integrations`
