# QA — Identidad del contacto (verificación de nombre)

Checklist para validar en **staging** antes de promover a producción.
Unit tests automáticos: `cd api && npx jest contact-identity` (cubren CASE 1, 2, 3, 5 a nivel de lógica pura).

| # | Escenario | Pasos | Resultado esperado |
|---|-----------|-------|--------------------|
| 1 | WA display name = "Mami ❤️", contacto nuevo | Escribir por WhatsApp desde un número nuevo cuyo nombre de perfil sea "Mami ❤️" | El bot NO saluda "Hola Mami ❤️". La ficha muestra el nombre con badge **Sin verificar** y "Nombre en WhatsApp: Mami ❤️". |
| 2 | WA display name = "Juan", `name_verified=false` | Igual que arriba con nombre "Juan" | El bot NO asume que se llama Juan; no lo usa para dirigirse a él. |
| 3 | Bot pregunta el nombre y el cliente responde | El bot pregunta "¿me indicas tu nombre?" → cliente: "José Martínez" | Se guarda `full_name=José Martínez`, `name_verified=true`, `name_source=customer`, `name_verified_at` con fecha. Mensaje de actividad "🤖 Bot confirmó el nombre del cliente: José Martínez". A partir de ahí el bot lo llama José. |
| 4 | Cliente da el nombre del **destinatario** | Cliente: "El destinatario es María Rodríguez" | `contact.full_name` NO cambia a María. `name_verified` no cambia. (El bot debe usar update_contact solo para datos propios y NUNCA confirm_contact_name con un tercero.) |
| 5 | Corrección de nombre | Cliente: "Mi nombre es José, no Juan" | `full_name=José`, `name_verified=true`, `name_source=customer`. |
| 6 | Confirmado en General → transferido a Booking | Confirmar nombre en el bot General, transferir a otra cola/bot | El segundo bot ve "Nombre confirmado: José" en la ficha y NO vuelve a preguntarlo. |
| 7 | Cliente no quiere dar su nombre | Cliente ignora la pregunta del nombre | La conversación continúa normal; el bot no bloquea ni insiste. |
| 8 | Agente humano confirma/corrige el nombre | En la ficha del contacto (web), botón **Confirmar nombre** → escribir/aceptar el nombre | `name_verified=true`, `name_source=agent`. Badge cambia a **Verificado**. El bot lo usa de inmediato. Queda registrado en audit log (`contact.name_confirmed`). |
| 9 | WhatsApp cambia su Display Name después | Cambiar el nombre de perfil de WhatsApp y volver a escribir | `whatsapp_display_name` se actualiza, pero `full_name` confirmado NO se sobrescribe. |
| 10 | Aislamiento multi-tenant | Dos tenants con contactos del mismo número/nombre | La confirmación en un tenant no afecta al otro; cada consulta filtra por `tenant_id`. |

## Notas de verificación técnica
- **Columnas nuevas** (`contacts`): `whatsapp_display_name`, `name_verified` (default false), `name_source` (default 'unknown'), `name_verified_at`. Se crean con `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` en `ContactsService.onModuleInit`.
- **Contactos existentes**: quedan `name_verified=false` / `name_source='unknown'`. Nada se marca verificado automáticamente.
- **Audit**: cada confirmación escribe en `audit_logs` (`action='contact.name_confirmed'`) y emite el evento `contact.name_confirmed`.
- **Herramienta del bot**: `confirm_contact_name(name)` es la ÚNICA vía para fijar el nombre; `update_contact` ya no puede tocar el nombre ni el teléfono.
