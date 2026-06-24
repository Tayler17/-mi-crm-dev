/**
 * Code-managed Help Center ADDITIONS.
 *
 * IMPORTANT: this seed does NOT rebuild the help center. It only documents the
 * NEW features added recently, slotting them into the EXISTING (hand-made)
 * structure. The existing categories/articles (seed_key IS NULL) are never
 * touched. Articles created here are upserted by `seedKey`; any seed-managed row
 * no longer listed here is pruned (only rows this seed owns).
 *
 * Two ways to place an article:
 *  - `categoryNames`: attach into an EXISTING hand-made category, matched by name
 *    (the article inherits that category's visibility).
 *  - `categorySeedKey`: attach into a NEW category defined below in HELP_CATEGORIES.
 *
 * OWNER-ONLY content (isGlobal: false) lives on the owner's tenant and is never
 * shown to tenants. GLOBAL content (isGlobal: true) is visible to every tenant.
 */

export interface SeedCategory {
  seedKey: string;
  name: string;
  icon: string;
  position: number;
  isGlobal: boolean;
}

export interface SeedArticle {
  seedKey: string;
  /** Attach into a NEW category from HELP_CATEGORIES (by its seedKey). */
  categorySeedKey?: string;
  /** Attach into an EXISTING hand-made category, matched by any of these names. */
  categoryNames?: string[];
  title: string;
  body: string;
  position: number;
  isGlobal: boolean;
  lang: string;
}

// ── NEW categories (only ones that did not already exist) ──────────────────────

export const HELP_CATEGORIES: SeedCategory[] = [
  { seedKey: 'call-bots',     name: 'Bots de llamada',       icon: '📞', position: 40, isGlobal: true },
  { seedKey: 'internal-chat', name: 'Chat interno',           icon: '💬', position: 50, isGlobal: true },
  { seedKey: 'owner-admin',   name: 'Administración (Owner)', icon: '🔧', position: 99, isGlobal: false },
];

// ── NEW articles (new features only) ──────────────────────────────────────────

export const HELP_ARTICLES: SeedArticle[] = [
  // ───────── Tenant-facing: configuring call bots ─────────
  {
    seedKey: 'callbot-setup',
    categorySeedKey: 'call-bots',
    isGlobal: true,
    position: 1,
    lang: 'es',
    title: 'Cómo configurar tu bot de llamada',
    body: `# Cómo configurar tu bot de llamada

Tu bot de llamada atiende el teléfono con IA: entiende al cliente, responde con voz natural, registra datos y puede transferir la llamada.

## 1. Voz
En el bot → pestaña **Voz** → **Voz del sistema**: elige una voz del catálogo. Para llamadas en tiempo real usa una voz **Deepgram Aura-2** (las de Twilio/ElevenLabs no suenan en llamadas en vivo). Elige una voz acorde al idioma del bot.

## 2. Idioma
Configura el **idioma** del bot. El bot **entiende a quien llame en cualquier idioma** y responde en el suyo; si el cliente le habla en otro idioma, normalmente se adapta.

## 3. Transferir a otro departamento/bot
Si tienes varios bots (p. ej. uno en español y otro en inglés), mételos en una **Cola** (menú **Colas**). Así un bot puede pasar la llamada al bot correcto cuando el cliente necesita otra área u otro idioma. El bot elige el destino por el idioma del que llama.

## 4. Transferir a un humano
En la configuración del bot pon el **número de transferencia**. Cuando el cliente pida hablar con una persona real, el bot desviará la llamada a ese número.

## 5. Conocimiento
En la pestaña **Conocimiento** añade URLs o PDFs de tu negocio: el bot usará esa información para responder.

## 6. Probar
Pulsa **Llamar** para una llamada de prueba; puedes **Colgar** desde el panel. El bot cuelga solo cuando la conversación termina.`,
  },
  {
    seedKey: 'callbot-setup-en',
    categorySeedKey: 'call-bots',
    isGlobal: true,
    position: 1,
    lang: 'en',
    title: 'How to set up your call bot',
    body: `# How to set up your call bot

Your call bot answers the phone with AI: it understands the caller, replies with a natural voice, captures data and can transfer the call.

## 1. Voice
On the bot → **Voice** tab → **System voice**: pick a voice from the catalog. For real-time calls use a **Deepgram Aura-2** voice (Twilio/ElevenLabs voices don't play on live calls). Choose a voice matching the bot's language.

## 2. Language
Set the bot's **language**. The bot **understands callers in any language** and replies in its own; if the caller speaks another language, it usually adapts.

## 3. Transfer to another department/bot
If you have several bots (e.g. one in Spanish and one in English), put them in a **Queue** (**Queues** menu). A bot can then pass the call to the right bot when the caller needs another area or language. The bot picks the destination by the caller's language.

## 4. Transfer to a human
In the bot's settings set the **transfer number**. When the caller asks to speak to a real person, the bot forwards the call to that number.

## 5. Knowledge
On the **Knowledge** tab add URLs or PDFs about your business: the bot uses that info to answer.

## 6. Testing
Click **Call** for a test call; you can **Hang up** from the panel. The bot hangs up on its own when the conversation ends.`,
  },
  // ───────── Into existing "Conversaciones" / Inbox category ─────────
  {
    seedKey: 'inbox-voice-media',
    categoryNames: ['Conversaciones', 'Inbox', 'Bandeja de entrada'],
    isGlobal: true,
    position: 20,
    lang: 'es',
    title: 'Notas de voz, imágenes y archivos',
    body: `# Notas de voz, imágenes y archivos

## Enviar imágenes y archivos

Pulsa el icono de **adjuntar** en el compositor y elige la imagen o el documento. El cliente lo recibe directamente en su WhatsApp.

## Grabar y enviar notas de voz

1. Pulsa el icono de **micrófono** en el compositor.
2. Habla tu mensaje.
3. Para/suelta para revisar y **envía**.

La nota de voz se entrega como audio reproducible en WhatsApp (formato de voz nativo). Las notas de voz **entrantes** del cliente también se reproducen directamente en el Inbox.`,
  },
  {
    seedKey: 'inbox-voice-media-en',
    categoryNames: ['Conversaciones', 'Inbox', 'Bandeja de entrada'],
    isGlobal: true,
    position: 20,
    lang: 'en',
    title: 'Voice notes, images and files',
    body: `# Voice notes, images and files

## Send images and files

Click the **attach** icon in the composer and choose the image or document. The customer receives it directly in their WhatsApp.

## Record and send voice notes

1. Click the **microphone** icon in the composer.
2. Speak your message.
3. Release/stop to review and **send**.

The voice note is delivered as a playable audio in WhatsApp (native voice format). **Incoming** voice notes from the customer also play directly in the Inbox.`,
  },
  {
    seedKey: 'inbox-edit-delete',
    categoryNames: ['Conversaciones', 'Inbox', 'Bandeja de entrada'],
    isGlobal: true,
    position: 21,
    lang: 'es',
    title: 'Editar y borrar mensajes enviados',
    body: `# Editar y borrar mensajes enviados

¿Te equivocaste en un mensaje ya enviado? Pasa el cursor por encima del mensaje y usa las acciones:

- **Borrar** — elimina el mensaje para ambos lados (en WhatsApp aparece *"Se eliminó este mensaje"*).
- **Editar** — corrige el texto. WhatsApp permite editar **hasta 15 minutos** después de enviado.

> Estas acciones dependen de lo que permita el canal. Pasado el tiempo de edición de WhatsApp, solo podrás borrar.`,
  },
  {
    seedKey: 'inbox-edit-delete-en',
    categoryNames: ['Conversaciones', 'Inbox', 'Bandeja de entrada'],
    isGlobal: true,
    position: 21,
    lang: 'en',
    title: 'Edit and delete sent messages',
    body: `# Edit and delete sent messages

Made a mistake in a message you already sent? Hover over the message and use the actions:

- **Delete** — removes the message for both sides (in WhatsApp it shows *"This message was deleted"*).
- **Edit** — fix the text. WhatsApp allows editing **for up to 15 minutes** after sending.

> These actions depend on what the channel allows. After WhatsApp's edit window, you can only delete.`,
  },

  // ───────── New "Chat interno" category ─────────
  {
    seedKey: 'chat-team',
    categorySeedKey: 'internal-chat',
    isGlobal: true,
    position: 1,
    lang: 'es',
    title: 'Mensajería del equipo',
    body: `# Mensajería del equipo

El **Chat interno** es la mensajería privada de tu equipo — separada del Inbox de clientes.

## Conversaciones directas

Elige un compañero de la lista y empieza a escribir. Verás su estado (**en línea / ausente / ocupado**) en tiempo real.

## Comodidades

- Al abrir un chat, salta automáticamente al **último mensaje**.
- Si escribes algo y cambias de chat, tu **borrador se conserva**.
- Puedes **editar** o **borrar** tus mensajes, y **compartir imágenes y audios**.`,
  },
  {
    seedKey: 'chat-team-en',
    categorySeedKey: 'internal-chat',
    isGlobal: true,
    position: 1,
    lang: 'en',
    title: 'Team messaging',
    body: `# Team messaging

**Internal Chat** is your team's private messaging — separate from the customer Inbox.

## Direct conversations

Pick a teammate from the list and start typing. You'll see their status (**online / away / busy**) in real time.

## Conveniences

- When you open a chat, it automatically jumps to the **latest message**.
- If you type something and switch chats, your **draft is kept**.
- You can **edit** or **delete** your messages, and **share images and audio**.`,
  },
  {
    seedKey: 'chat-groups',
    categorySeedKey: 'internal-chat',
    isGlobal: true,
    position: 2,
    lang: 'es',
    title: 'Grupos',
    body: `# Grupos

Crea **grupos** para coordinar por departamento o proyecto.

## Crear un grupo

1. En el Chat interno pulsa **Nuevo grupo**.
2. Ponle nombre y añade miembros.

## Gestionar

Dentro del grupo puedes **añadir o quitar miembros**, **renombrarlo** y, si ya no se usa, **eliminar el grupo**. También puedes **eliminar una conversación** directa de tu lista.`,
  },
  {
    seedKey: 'chat-groups-en',
    categorySeedKey: 'internal-chat',
    isGlobal: true,
    position: 2,
    lang: 'en',
    title: 'Groups',
    body: `# Groups

Create **groups** to coordinate by department or project.

## Create a group

1. In Internal Chat click **New group**.
2. Name it and add members.

## Manage

Inside the group you can **add or remove members**, **rename it** and, if no longer needed, **delete the group**. You can also **delete a direct conversation** from your list.`,
  },
  {
    seedKey: 'chat-voice',
    categorySeedKey: 'internal-chat',
    isGlobal: true,
    position: 3,
    lang: 'es',
    title: 'Notas de voz en el chat',
    body: `# Notas de voz en el chat

Además de texto e imágenes, puedes grabar **notas de voz** dentro del chat interno:

1. Pulsa el icono de **micrófono**.
2. Graba tu mensaje.
3. Envíalo — tus compañeros podrán reproducirlo al instante.

Ideal para explicar algo rápido sin escribir.`,
  },
  {
    seedKey: 'chat-voice-en',
    categorySeedKey: 'internal-chat',
    isGlobal: true,
    position: 3,
    lang: 'en',
    title: 'Voice notes in chat',
    body: `# Voice notes in chat

Besides text and images, you can record **voice notes** inside the internal chat:

1. Click the **microphone** icon.
2. Record your message.
3. Send it — teammates can play it instantly.

Great for explaining something quickly without typing.`,
  },

  // ═════════ OWNER-ONLY: "Administración (Owner)" ═════════
  {
    seedKey: 'owner-platform-keys',
    categorySeedKey: 'owner-admin',
    isGlobal: false,
    position: 1,
    lang: 'es',
    title: 'Configuración de plataforma y API keys',
    body: `# Configuración de plataforma y API keys

> 🔒 **Solo el propietario (owner).** Los tenants no ven este artículo.

En **Configuración** (sección de owner) se guardan las claves de los servicios externos que usan TODOS los tenants:

| Servicio | Para qué | Variable |
| --- | --- | --- |
| **OpenAI** | Chatbots de IA y transcripción | \`OPENAI_API_KEY\` |
| **Deepgram** | Transcripción en tiempo real (bots de llamada streaming) | \`DEEPGRAM_API_KEY\` |
| **ElevenLabs** | Voz de los bots de llamada | clave en el panel |
| **Twilio** | Telefonía (llamadas entrantes/salientes) | credenciales de cuenta |

## Recomendaciones

- Estas claves son **sensibles**: nunca las compartas ni las publiques.
- Si rotas una clave en el proveedor, actualízala aquí para no interrumpir el servicio.
- Un saldo agotado en OpenAI/Deepgram/ElevenLabs **detiene** la función correspondiente; revisa el saldo si un bot deja de responder.`,
  },
  {
    seedKey: 'owner-platform-keys-en',
    categorySeedKey: 'owner-admin',
    isGlobal: false,
    position: 1,
    lang: 'en',
    title: 'Platform settings and API keys',
    body: `# Platform settings and API keys

> 🔒 **Owner only.** Tenants do not see this article.

In **Settings** (owner section) you store the keys for the external services used by ALL tenants:

| Service | Used for | Variable |
| --- | --- | --- |
| **OpenAI** | AI chatbots and transcription | \`OPENAI_API_KEY\` |
| **Deepgram** | Real-time transcription (streaming call bots) | \`DEEPGRAM_API_KEY\` |
| **ElevenLabs** | Call-bot voice | key in the panel |
| **Twilio** | Telephony (inbound/outbound calls) | account credentials |

## Recommendations

- These keys are **sensitive**: never share or publish them.
- If you rotate a key at the provider, update it here so the service isn't interrupted.
- An exhausted balance on OpenAI/Deepgram/ElevenLabs **stops** the related feature; check the balance if a bot stops responding.`,
  },
  {
    seedKey: 'owner-deploy-infra',
    categorySeedKey: 'owner-admin',
    isGlobal: false,
    position: 2,
    lang: 'es',
    title: 'Despliegue e infraestructura (VPS)',
    body: `# Despliegue e infraestructura (VPS)

> 🔒 **Solo el propietario (owner).** Los tenants no ven este artículo.

La plataforma corre en Docker sobre un VPS, detrás de Nginx + HTTPS.

## Comandos de despliegue

\`\`\`bash
# Solo cambió el backend (API)
cd /opt/crm && git pull && docker compose up -d --force-recreate api

# Cambió el frontend (web) — OBLIGATORIO --build
cd /opt/crm && git pull && docker compose up -d --build web

# Cambiaron ambos
cd /opt/crm && git pull && docker compose up -d --build web && docker compose up -d --force-recreate api

# Se añadió una dependencia nueva al backend
cd /opt/crm && git pull && docker compose up -d --build --renew-anon-volumes api
\`\`\`

## Notas

- \`--force-recreate\` **no** reconstruye imágenes; solo \`--build\` lo hace.
- El frontend se sirve desde imagen pre-construida: sin \`--build\` los cambios de web **no** se despliegan.
- HTTPS se gestiona con Nginx + Certbot; los dominios apuntan al VPS.`,
  },
  {
    seedKey: 'owner-deploy-infra-en',
    categorySeedKey: 'owner-admin',
    isGlobal: false,
    position: 2,
    lang: 'en',
    title: 'Deployment and infrastructure (VPS)',
    body: `# Deployment and infrastructure (VPS)

> 🔒 **Owner only.** Tenants do not see this article.

The platform runs on Docker on a VPS, behind Nginx + HTTPS.

## Deployment commands

\`\`\`bash
# Only the backend (API) changed
cd /opt/crm && git pull && docker compose up -d --force-recreate api

# The frontend (web) changed — --build is REQUIRED
cd /opt/crm && git pull && docker compose up -d --build web

# Both changed
cd /opt/crm && git pull && docker compose up -d --build web && docker compose up -d --force-recreate api

# A new backend dependency was added
cd /opt/crm && git pull && docker compose up -d --build --renew-anon-volumes api
\`\`\`

## Notes

- \`--force-recreate\` does **not** rebuild images; only \`--build\` does.
- The frontend is served from a pre-built image: without \`--build\`, web changes are **not** deployed.
- HTTPS is handled with Nginx + Certbot; domains point to the VPS.`,
  },
  {
    seedKey: 'owner-voice-callbots',
    categorySeedKey: 'owner-admin',
    isGlobal: false,
    position: 3,
    lang: 'es',
    title: 'Catálogo de voces y bots de llamada en tiempo real',
    body: `# Catálogo de voces y bots de llamada en tiempo real

> 🔒 **Solo el propietario (owner).** Los tenants no ven este artículo.

## Motor de voz: Deepgram Voice Agent

Los bots de llamada funcionan en **tiempo real** con el **Deepgram Voice Agent** (escucha + IA + voz en una sola conexión, baja latencia). En llamadas en vivo:

- **Voz (TTS):** SOLO funcionan las voces **Deepgram Aura-2**. Las voces ElevenLabs/Twilio del catálogo **se ignoran** en tiempo real (suena una Aura por defecto). Aura es la de menor latencia.
- **Escucha:** Deepgram **nova-3 multilingüe** → el bot **entiende cualquier idioma**; responde en su idioma (y con el modelo gpt-4o se adapta al del cliente).
- **Audio:** Twilio Media Streams bidireccional, con corte por interrupción (*barge-in*).

Requisitos: clave de **Deepgram** configurada y el bloque WebSocket de Nginx para \`/call-bots/twilio/media-stream\`.

## Catálogo global de voces

En **Catálogo de Voces** defines las voces disponibles para los tenants (sin que toquen credenciales). Para llamadas, añade voces **Deepgram Aura-2**. Marca una ⭐ como **predeterminada por idioma** (es/en): los bots sin voz elegida usan esa.

## Modelo de IA (LLM)

El "cerebro" de los bots se configura en **Ajustes → Plataforma → IA → Model** (afecta a call bots y chatbots). Recomendado: **gpt-4o** (gpt-4o-mini titubeaba al llamar funciones como transferir/colgar).

## Transferencias

- **A otro departamento/bot:** se enrutan por **colas** — un bot aparece como destino si está en una cola activa. El destino se elige por **idioma** del que llama.
- **A un humano:** se marca el número en \`Número de transferencia\` del bot.

## Números de teléfono

Los números de Twilio se administran desde el owner y se asignan a los bots de cada tenant.`,
  },
  {
    seedKey: 'owner-voice-callbots-en',
    categorySeedKey: 'owner-admin',
    isGlobal: false,
    position: 3,
    lang: 'en',
    title: 'Voice catalog and real-time call bots',
    body: `# Voice catalog and real-time call bots

> 🔒 **Owner only.** Tenants do not see this article.

## Voice engine: Deepgram Voice Agent

Call bots run in **real time** on the **Deepgram Voice Agent** (listen + LLM + speech in one connection, low latency). On live calls:

- **Voice (TTS):** ONLY **Deepgram Aura-2** voices work. ElevenLabs/Twilio catalog voices are **ignored** in real time (a default Aura is used). Aura has the lowest latency.
- **Listening:** Deepgram **nova-3 multilingual** → the bot **understands any language**; it replies in its own language (and with the gpt-4o model it adapts to the caller's).
- **Audio:** bidirectional Twilio Media Streams, with interruption cutoff (*barge-in*).

Requirements: **Deepgram** key configured and the Nginx WebSocket block for \`/call-bots/twilio/media-stream\`.

## Global voice catalog

In **Voice Catalog** you define the voices available to tenants (without them touching credentials). For calls, add **Deepgram Aura-2** voices. Mark one ⭐ as **default per language** (es/en): bots with no voice chosen use it.

## AI model (LLM)

The bots' "brain" is set in **Settings → Platform → AI → Model** (affects call bots and chatbots). Recommended: **gpt-4o** (gpt-4o-mini hesitated when calling functions like transfer/hang-up).

## Transfers

- **To another department/bot:** routed via **queues** — a bot appears as a destination if it's in an active queue. The destination is chosen by the caller's **language**.
- **To a human:** set the number in the bot's \`Transfer number\`.

## Phone numbers

Twilio numbers are managed by the owner and assigned to each tenant's bots.`,
  },
];
