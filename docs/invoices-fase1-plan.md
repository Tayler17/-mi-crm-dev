# Plan técnico — Invoices & Payments (AutoMarkIQ) · Fase 1

Facturas formales con **pagos Stripe/transferencia/efectivo, pagos parciales, reembolsos, notas de crédito**, historial e integración con contactos/deals/IA — **reutilizando Connect, `payment_links`, webhooks y automatizaciones** sin duplicarlos.

**Principios:** ampliar no reconstruir · feature-flagged · **staging + Stripe test mode** antes de prod · typecheck + pruebas por etapa · aislamiento por tenant y RBAC existente · **procesamiento de pagos de tenants TOTALMENTE separado del billing de suscripciones de AutoMarkIQ**.

> Documento para revisión. **No se escribe código hasta aprobarlo.**

---

## 1. Decisiones confirmadas
1. **Impuestos:** por línea, con tasa por defecto a nivel factura sobrescribible por línea.
2. **Moneda:** multimoneda (una por factura). **No asumir 2 decimales** (JPY=0, BHD/KWD=3…).
3. **PDF:** PDFKit.
4. **Application fee:** 0% inicial, **configurable** a futuro.
5. **Numeración:** `INV-2026-0001`, secuencia por tenant, prefijo/formato personalizable.
6. **Notas de crédito:** incluidas desde Fase 1 — **numeración propia** (`CN-2026-0001`), **referencia a la factura original**, trazabilidad. Factura emitida = **inmutable** (correcciones vía nota de crédito). Sin módulo contable completo.
7. **Permisos:** anular, emitir nota de crédito y registrar reembolsos → **solo admin / roles con permiso explícito** (RBAC existente).
8. **Reembolsos Stripe:** totales y parciales **desde el diseño**. Si el reembolso se inicia en Stripe, AutoMarkIQ **recibe el evento, concilia y ajusta el saldo** según reglas del ledger (nunca marcar "impaga" sin aplicar bien las reglas).
9. **Redondeo/dinero:** importes guardados en **unidad mínima entera** de la moneda (minor units, `bigint`); **política de redondeo explícita** para impuestos/descuentos; precisión suficiente durante el cálculo; reglas **documentadas por moneda**.
10. **Datos del emisor:** **Ajustes → Facturas**; cada empresa configura datos legales/fiscales **antes de emitir**. Los borradores se crean sin esa config.

## 2. Condiciones añadidas (obligatorias)
- **Separar** estado **financiero**, estado de **envío** y condición de **vencimiento** (3 dimensiones independientes).
- Un **webhook duplicado NUNCA** registra dos pagos (idempotencia por `event.id` + unicidad por `provider_ref`).
- **No asumir 2 decimales** en ninguna moneda.
- **Verificar reglas fiscales aplicables** antes de prometer numeración sin huecos o validez legal en cualquier país (ver §11, aviso legal).
- **Aislar por completo** el procesamiento de pagos de tenants del billing de suscripciones (webhooks y código separados).
- **Pruebas** de pagos parciales, reembolsos, concurrencia, cambios de estado y aislamiento multi-tenant.

---

## 3. Lo que ya existe (se reutiliza)
`payment_accounts` (Connect por tenant) · `createConnectPaymentLink(...)` (`billing.service.ts:378`) · `payment_links` · webhook `processEvent` (`:176`, **compartido con suscripciones**) · `getPaymentLinks` poll (`:451`) · `transactions` · `AuditService` · tool `create_payment_link` del bot (`ai-chatbot-engine.ts:771`) · `/pay/<code>`.

---

## 4. Representación del dinero (clave)
- **Almacenar** todos los importes como **enteros en minor units** (`amount_minor bigint`) + `currency`.
- Tabla/mapa **`currencies`**: `code`, `decimals` (0/2/3), `stripe_min_charge`… Fuente: reglas de Stripe por moneda. Validar que Stripe soporte la moneda antes de cobrar.
- **Cálculo:** mantener precisión alta internamente (ej. enteros escalados o decimal), redondear **al final** a minor units con política documentada:
  - Impuesto: redondear **por línea** (half-up) y sumar. Descuentos: aplicar antes del impuesto, redondeo documentado.
  - El redondeo y los decimales se derivan de `currencies.decimals`, nunca hardcodear 2.
- Nunca enviar a Stripe un importe en "unidades mayores"; siempre minor units.

## 5. Estados separados (3 dimensiones)
- **`financial_status`:** `draft` → `issued` → `partially_paid` → `paid` → `partially_refunded` → `refunded` · `void`.
- **`delivery_status`:** `not_sent` → `sent` (→ `viewed` si se traquea).
- **`overdue`:** **derivado** (no almacenado): `financial_status ∈ {issued,partially_paid}` ∧ `balance>0` ∧ `due_date<hoy` ∧ ¬void.
- Enviar NO cambia el financiero; pagar NO cambia el de envío; el vencimiento se calcula. Los filtros del inbox/listado combinan las 3.

---

## 6. Modelo de datos (nuevas tablas; `onModuleInit` con `CREATE TABLE/ALTER … IF NOT EXISTS`)
**`invoices`** — `id`, `tenant_id`, `contact_id`, `deal_id?`, `kind` (`invoice|quote`), `number?`, `number_seq?`, `financial_status`, `delivery_status`, `currency`, `default_tax_rate`, `subtotal_minor`, `tax_minor`, `total_minor`, `amount_paid_minor`, (`balance_minor` calc), `due_date`, `notes`, `terms`, `issuer_snapshot jsonb`, `buyer_snapshot jsonb`, `issued_at`, `sent_at`, `paid_at`, `voided_at`, `created_by`, timestamps.

**`invoice_items`** — `id`, `invoice_id`, `description`, `quantity`, `unit_price_minor`, `discount_minor?`, `tax_rate?` (hereda default), `line_subtotal_minor`, `line_tax_minor`, `line_total_minor`, `sort_order`.

**`invoice_payments`** (ledger) — `id`, `tenant_id`, `invoice_id`, `method` (`stripe|transfer|cash`), `direction` (`charge|refund`), `amount_minor`, `currency`, `status` (`pending|succeeded|failed|refunded`), `payment_link_id?`, `payment_session_id?`, `provider_ref?` (**UNIQUE** por tenant), `received_at`, `recorded_by?`, `note`.

**`credit_notes`** — `id`, `tenant_id`, `invoice_id`, `number` (`CN-2026-0001`), `number_seq`, `reason`, `amount_minor`, `currency`, `issuer_snapshot`, `created_by`, `issued_at`, timestamps. (Opcional `credit_note_items` si se quiere detalle por línea; Fase 1 puede ser por monto + motivo.)

**`invoice_events`** (historial) — `id`, `tenant_id`, `invoice_id`, `type` (`created|updated|issued|sent|payment|refund|credit_note|voided`), `data jsonb`, `actor_id?`, `actor` (`user|bot|system|stripe`), `created_at`.

**`tenant_invoice_settings`** — `tenant_id` PK, `business_name`, `address`, `tax_id` (VAT/NIF), `email`, `phone`, `logo_url`, `number_prefix`, `cn_prefix`, `default_currency`, `default_tax_rate`, `footer_terms`.

**`currencies`** — `code`, `decimals`, `stripe_supported`, `stripe_min_charge_minor`.

**`stripe_webhook_events`** (dedup) — `event_id` **PK/UNIQUE**, `type`, `received_at`. Garantiza "procesar cada evento una sola vez".

**Numeración:** `number` se asigna **al emitir**, dentro de **advisory lock por (tenant, tipo, año)**; sin huecos; anuladas conservan número; notas de crédito con su propia secuencia.

---

## 7. Aislamiento de pagos de tenants vs suscripciones (condición crítica)
- **Dos webhooks separados en Stripe:**
  - `/billing/webhook` (existente) → **solo** suscripciones SaaS de AutoMarkIQ (cuenta de plataforma). **No se toca.**
  - `/billing/webhook/connect` (**nuevo**) → eventos de **cuentas conectadas** (checkouts de facturas/links de tenants, refunds). Secret propio.
- Código separado: `InvoicePaymentsService` maneja el webhook Connect; `BillingService.processEvent` (suscripciones) queda intacto.
- Los `payment_links` del bot (que hoy pasan por el webhook compartido) se migran al endpoint Connect o se cubren por **poll** — definir en Etapa 5 sin romper su comportamiento actual.
- **Idempotencia:** antes de procesar, `INSERT INTO stripe_webhook_events(event_id) ON CONFLICT DO NOTHING RETURNING` → si ya existía, **ignorar**. Además, `invoice_payments.provider_ref` UNIQUE. Dos capas → un webhook duplicado nunca registra dos pagos.

## 8. Pagos, reembolsos y notas de crédito (reglas del ledger)
- `amount_paid_minor = Σ(charges succeeded) − Σ(refunds succeeded)`. `balance = total − amount_paid`.
- **Reembolso** (Stripe total/parcial, o manual): fila `invoice_payments(direction='refund', status='succeeded')`. Recalcular estado:
  - `balance==0` y sin refunds → `paid`; con refunds parciales → `partially_refunded`; refund total → `refunded`. **Nunca** saltar a "impaga" sin recomputar el ledger.
  - Reembolso iniciado en Stripe → evento `charge.refunded` en el webhook Connect → conciliar.
- **Nota de crédito:** documento aparte (numeración propia, referencia a la factura, motivo, trazabilidad). No edita la factura (inmutable). Puede o no ir acompañada de un reembolso de dinero.

## 9. Permisos (RBAC existente, 3 roles)
- **Ver:** todos los roles del tenant. **Crear/editar borrador/emitir/enviar/registrar pago:** admin + agente (o rol con permiso). **Anular / nota de crédito / reembolso:** **solo admin / permiso explícito**. Todo tenant-scoped (`tenant.middleware`).

## 10. Datos del emisor · PDF · envío · frontend · IA · cotizaciones
- **Ajustes → Facturas** (`tenant_invoice_settings`) obligatorio antes de **emitir** (borrador no lo exige).
- **PDF** (PDFKit) con emisor/comprador/líneas/impuesto por línea/totales/saldo/moneda (decimales correctos) → `uploads/invoices/`.
- **Envío** por WhatsApp o email (reusar canal saliente + SMTP) con `shortUrl` + PDF.
- **Frontend:** sección Facturas (lista con 3 estados + saldo, form con líneas, acciones Borrador/Emitir/PDF/Enviar/Registrar pago/Nota de crédito); verlas en contacto/deal.
- **IA:** el bot ya crea links; ampliar a crear borrador/emitir/enviar reusando estos endpoints.
- **Cotizaciones:** `kind='quote'` comparte tablas; sin número fiscal hasta `convert`. No se construye ahora.

---

# ANÁLISIS PREVIO

## 11. Fiscal y legal (aviso importante)
- **No es asesoría fiscal.** La **numeración sin huecos** y la **validez legal** de una factura **dependen del país** (p. ej. UK, ES, IT, PT tienen reglas distintas; gapless es obligatorio en algunos, no en todos). AutoMarkIQ es multi-tenant → distintos tenants pueden estar en distintas jurisdicciones.
- **Por eso:** el módulo provee la **mecánica** (numeración secuencial configurable, inmutabilidad, impuesto desglosado y congelado, datos del emisor, notas de crédito, trazabilidad) pero **no garantiza cumplimiento legal por país**. Antes de prometerlo a un cliente concreto, **verificar las reglas de su país**. Documentar esto en el producto (disclaimer) y dejar el formato de numeración y textos configurables por tenant.
- Impuesto **congelado al emitir** (cambios de tasa no alteran facturas históricas). Cumplimiento fiscal real (presentación IVA, MTD) = **integrar** contabilidad (QuickBooks/Xero) a futuro.

## 12. Incompatibilidades con la arquitectura actual
1. `payment_links` (monto único, pending/paid/expired) **no** modela parciales/efectivo/transferencia/refunds → se añade `invoice_payments` (ledger). `payment_links` queda como artefacto de checkout Stripe.
2. Importes hoy en `numeric` (unidades mayores) → se adopta **minor units enteros** para invoices (nuevo), con mapa de `currencies`.
3. No existen datos del emisor → `tenant_invoice_settings`.
4. **Webhook compartido** con suscripciones → se separa en endpoint Connect propio (condición del usuario).
5. No hay generador de PDF → PDFKit.
6. No hay refunds ni notas de crédito → se añaden con reglas de ledger.
7. Dedup de eventos inexistente → `stripe_webhook_events` + `provider_ref` UNIQUE.

## 13. Riesgos de tocar los webhooks (crítico)
- El webhook actual **cobra los planes de AutoMarkIQ**: romperlo afecta tu propio ingreso. → **No se modifica**; los pagos de facturas van por **endpoint Connect separado** + **poll** de respaldo (los eventos de cuentas Connect no siempre llegan al webhook de plataforma).
- Verificar en cada deploy de billing que **suscripciones y links del bot siguen intactos** (prueba de regresión).

---

# SECUENCIA DE IMPLEMENTACIÓN Y CRITERIOS DE ACEPTACIÓN

> Cada etapa: rama `staging` → typecheck → **Stripe test mode** → pruebas verdes → criterios cumplidos → promover a prod. En toda etapa que toque billing: **regresión de suscripciones + links del bot**.

### Etapa 0 — Cimientos (dinero, monedas, settings, RBAC)
- Mapa `currencies` (decimales por moneda), helpers de minor units + redondeo documentado; `tenant_invoice_settings` + pantalla Ajustes → Facturas; permisos RBAC definidos y aplicados.
- **Aceptación:** guardar datos del emisor; helpers manejan monedas de 0/2/3 decimales correctamente; los guards de permiso bloquean acciones no autorizadas.
- **Pruebas:** conversión/redondeo por moneda (incl. JPY=0, BHD=3); verificación de permisos.

### Etapa 1 — Borradores (CRUD, sin número, sin pago)
- `invoices`+`invoice_items`; crear/editar/borrar draft; cálculo servidor (impuesto por línea + default, descuentos, redondeo); multimoneda (una por factura).
- **Aceptación:** totales correctos por moneda; borrador NO exige settings del emisor; no visible entre tenants.
- **Pruebas:** exactitud de cálculo (líneas/impuesto/descuento/redondeo); **aislamiento multi-tenant** (A no ve/edita B).

### Etapa 2 — Emitir (inmutabilidad + numeración)
- `issue`: exige settings del emisor; asigna número sin huecos (advisory lock por tenant+año); congela snapshots + impuesto; bloquea edición; `financial_status=issued`.
- **Aceptación:** emitida = inmutable (edición rechazada); números secuenciales y únicos; sin exigir settings → error claro.
- **Pruebas:** **concurrencia** (emisiones en paralelo → números únicos, secuenciales, sin huecos ni duplicados); inmutabilidad; gate de settings.

### Etapa 3 — Estados separados (financiero/envío/vencimiento)
- Tres dimensiones; `overdue` derivado; filtros.
- **Aceptación:** las dimensiones no se pisan; enviar no cambia el financiero; `overdue` correcto en el límite (hoy vs ayer).
- **Pruebas:** matriz de transiciones de estado; frontera de vencimiento.

### Etapa 4 — Ledger de pagos manuales (transferencia/efectivo + parciales)
- `invoice_payments` (charge manual); recomputar `amount_paid`/`balance`; `partially_paid`/`paid`; permisos.
- **Aceptación:** parciales se acumulan; saldo correcto; sobrepago manejado (regla definida); solo roles permitidos registran pago.
- **Pruebas:** **pagos parciales** (secuencia → paid); matemática del saldo; permisos.

### Etapa 5 — Pago Stripe (Connect) + webhook aislado + idempotencia
- Link Connect por monto (total o parcial); **endpoint `/billing/webhook/connect` nuevo**; dedup `stripe_webhook_events`; conciliar → `invoice_payments(stripe)` succeeded; **poll** de respaldo.
- **Aceptación:** pagar el link marca pago succeeded + actualiza saldo; **webhook duplicado → un solo pago**; **suscripciones del SaaS intactas**; funciona por webhook **y** por poll.
- **Pruebas:** **entrega duplicada de webhook → 1 pago** (dedup); **aislamiento** (eventos de suscripción no tocan facturas y viceversa); flujo e2e en test mode.

### Etapa 6 — Reembolsos + notas de crédito
- Refund Stripe total/parcial (API) + recibir `charge.refunded` en webhook Connect → conciliar ledger; `credit_notes` (numeración propia, referencia, motivo, trazabilidad); reglas de estado (`partially_refunded`/`refunded`, nunca "impaga" mal).
- **Aceptación:** refund ajusta saldo según ledger; nota de crédito con número propio + referencia a la factura; refund iniciado en Stripe se concilia; no hay marca "impaga" incorrecta.
- **Pruebas:** **reembolsos** total y parcial (matemática del ledger); refund-desde-Stripe conciliado; numeración/trazabilidad de la nota de crédito.

### Etapa 7 — PDF (PDFKit) + envío (WhatsApp/email)
- PDF con todos los campos requeridos y decimales correctos; enviar por ambos canales con link + PDF; `delivery_status`.
- **Aceptación:** PDF válido (campos obligatorios, moneda correcta); envío por WhatsApp y email; estado de envío actualizado.
- **Pruebas:** snapshot del contenido del PDF; la ruta de envío setea `delivery_status` sin tocar el financiero.

### Etapa 8 — Frontend
- Sección Facturas + acciones + verlas en contacto/deal; reflejar permisos.
- **Aceptación:** ciclo completo operable desde UI; acciones restringidas ocultas/bloqueadas por rol.
- **Pruebas:** smoke e2e del ciclo; visibilidad por rol.

### Etapa 9 — Historial + IA + feature flag + futuro
- `invoice_events` (timeline); herramientas del bot (borrador/emitir/enviar); `invoices.enabled` flag; `application_fee` configurable (stub 0%); groundwork de cotizaciones.
- **Aceptación:** timeline registra todos los eventos; flag oculta el módulo; el bot puede crear/emitir/enviar.
- **Pruebas:** registro de eventos; gating por flag.

---

## 14. Matriz de pruebas (cobertura exigida)
| Área | Etapa principal |
|---|---|
| Pagos parciales (acumulación, saldo, estados) | 4, 5 |
| Reembolsos (total/parcial, ledger, desde Stripe) | 6 |
| Concurrencia (numeración sin huecos/duplicados) | 2 |
| Cambios de estado (financiero/envío/vencimiento) | 3 |
| Aislamiento multi-tenant | 1, 5, 8 |
| Idempotencia de webhook duplicado | 5 |
| Redondeo por moneda (0/2/3 decimales) | 0, 1 |
| Regresión suscripciones + links del bot | 5, 6 (cada deploy de billing) |

## 15. Decisiones cerradas (aprobadas)
1. **Nota de crédito:** **con líneas de detalle** desde Fase 1 (`credit_note_items`, reutilizando la estructura/componentes de `invoice_items`), referencia a la factura original, motivo, numeración propia, y **correcciones parciales de conceptos e impuestos**. No duplicar lógica.
2. **Sobrepago manual:** **bloquear** cualquier pago que supere el saldo pendiente + aviso claro. **Pagos parciales SÍ permitidos.** Sin saldos a favor por ahora.
3. **`viewed`:** a **Fase 2**. Arquitectura preparada para añadirlo sin cambios significativos (el `delivery_status` ya admite el valor; solo falta el tracking).

## 16. Estado de ejecución
- **Diseño funcional Fase 1: APROBADO** por el usuario.
- **Etapa 0 autorizada SOLO en staging**, con criterios de aceptación documentados. Condiciones: no tocar producción; no afectar Stripe Billing de AutoMarkIQ ni los payment links existentes; aislamiento multi-tenant + RBAC; ejecutar pruebas; informar archivos/componentes modificados; mostrar resultados de pruebas **antes** de avanzar a Etapa 1; **no continuar a etapas siguientes sin aprobación**.
