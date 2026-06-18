/**
 * Code-managed Help Center content.
 *
 * GLOBAL articles (isGlobal: true) are visible to every tenant — they describe
 * the features tenants actually use. OWNER-ONLY articles (isGlobal: false) live
 * on the owner's tenant and are NEVER shown to tenants: platform settings & API
 * keys, billing/plans, deploy/infrastructure, and voice-catalog / call-bot setup.
 *
 * To edit the help center, change the text here and redeploy — the seeder upserts
 * by `seedKey`, so changes ship without duplicating rows.
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
  categorySeedKey: string;
  title: string;
  body: string;
  position: number;
  isGlobal: boolean;
  lang: string;
}

// ── Categories ────────────────────────────────────────────────────────────────

export const HELP_CATEGORIES: SeedCategory[] = [
  // Tenant-facing
  { seedKey: 'getting-started', name: 'Primeros pasos',       icon: '🚀', position: 1, isGlobal: true },
  { seedKey: 'contacts',        name: 'Contactos y empresas', icon: '👥', position: 2, isGlobal: true },
  { seedKey: 'deals',           name: 'Deals y pipelines',    icon: '📊', position: 3, isGlobal: true },
  { seedKey: 'inbox',           name: 'Inbox',                icon: '📥', position: 4, isGlobal: true },
  { seedKey: 'internal-chat',   name: 'Chat interno',         icon: '💬', position: 5, isGlobal: true },
  { seedKey: 'tasks',           name: 'Tareas',               icon: '✓',  position: 6, isGlobal: true },
  { seedKey: 'ai-chatbots',     name: 'Chatbots de IA',       icon: '🤖', position: 7, isGlobal: true },
  { seedKey: 'call-bots',       name: 'Bots de llamada',      icon: '📞', position: 8, isGlobal: true },
  // Owner-only
  { seedKey: 'owner-admin',     name: 'Administración (Owner)', icon: '🔧', position: 1, isGlobal: false },
];

// ── Articles ────────────────────────────────────────────────────────────────

export const HELP_ARTICLES: SeedArticle[] = [
  // ───────────────────────── Primeros pasos (global) ─────────────────────────
  {
    seedKey: 'gs-welcome',
    categorySeedKey: 'getting-started',
    isGlobal: true,
    position: 1,
    lang: 'es',
    title: 'Bienvenido a AutoMarkIQ',
    body: `# Bienvenido a AutoMarkIQ

AutoMarkIQ es tu CRM todo-en-uno: gestiona **contactos**, **oportunidades de venta (deals)**, una **bandeja de entrada (Inbox)** unificada para WhatsApp y otros canales, **chat interno** para tu equipo, y **asistentes de IA** que responden mensajes y llamadas por ti.

## Navegación

El menú lateral está organizado en secciones:

- **Core CRM** — Dashboard, Contactos, Empresas, Deals, Kanban, Tareas.
- **Comunicación** — Inbox, Chat interno, Colas, Equipos.
- **Automatización** — Flows, Automatizaciones, Prompts de IA, Chatbots, Bots de llamada.

## Primeros pasos recomendados

1. Completa **tu perfil** (nombre y foto) desde el menú de usuario, arriba a la derecha.
2. Invita a tu **equipo** (ver *Configura tu cuenta y equipo*).
3. Conecta **WhatsApp** para empezar a recibir mensajes en el Inbox.
4. Crea tus primeros **contactos** y **deals**.

> Consejo: usa el buscador (atajo **Ctrl + K**) para saltar rápidamente a cualquier sección.`,
  },
  {
    seedKey: 'gs-account-team',
    categorySeedKey: 'getting-started',
    isGlobal: true,
    position: 2,
    lang: 'es',
    title: 'Configura tu cuenta y equipo',
    body: `# Configura tu cuenta y equipo

## Tu perfil

Desde el menú de usuario (arriba a la derecha) → **Mi perfil** puedes cambiar tu nombre y foto. Tu estado de disponibilidad (**en línea / ausente / ocupado**) se muestra a tus compañeros en el chat interno.

## Roles del equipo

AutoMarkIQ tiene tres niveles de acceso:

| Rol | Para quién | Puede |
| --- | --- | --- |
| **Admin** | Dueño del negocio | Todo dentro de su cuenta: usuarios, configuración, integraciones, informes |
| **Agente** | Personal de atención | Inbox, contactos, deals y tareas asignadas |

## Invitar usuarios

Si eres **admin**, ve a **Configuración → Usuarios** y pulsa **Nuevo usuario**. Define su nombre, correo, rol y contraseña inicial. El usuario podrá iniciar sesión de inmediato.

> El número de usuarios depende de tu plan. Si llegas al límite, contacta para ampliarlo.`,
  },

  // ───────────────────────── Contactos (global) ─────────────────────────
  {
    seedKey: 'contacts-manage',
    categorySeedKey: 'contacts',
    isGlobal: true,
    position: 1,
    lang: 'es',
    title: 'Gestionar contactos',
    body: `# Gestionar contactos

## Crear un contacto

Ve a **Contactos → Nuevo contacto**. Como mínimo necesitas un nombre o un teléfono. Los contactos también se crean **automáticamente** cuando alguien te escribe por WhatsApp.

## Ficha del contacto

Al abrir un contacto verás:

- **Datos** — nombre, teléfono, correo, fecha de alta.
- **Tags (etiquetas)** — pulsa **+ Tag** para clasificar (ej. *Cliente*, *Lead*, *VIP*). Si no aparece ninguno, créalos primero en **Configuración → Tags**.
- **Campos personalizados** — información extra propia de tu negocio.
- **Conversaciones** — historial de chats y llamadas. **Pulsa cualquier conversación para abrirla en el Inbox.**

## Etiquetas (tags)

Las etiquetas te permiten segmentar y luego filtrar contactos o lanzar campañas. Un contacto puede tener varias.`,
  },
  {
    seedKey: 'contacts-companies',
    categorySeedKey: 'contacts',
    isGlobal: true,
    position: 2,
    lang: 'es',
    title: 'Empresas',
    body: `# Empresas

Las **empresas** agrupan contactos que pertenecen a la misma organización.

## Crear y vincular

1. Ve a **Empresas → Nueva empresa**.
2. Desde la ficha de un contacto puedes asociarlo a una empresa.

Así, al abrir una empresa, ves todos sus contactos y deals relacionados en un solo lugar — útil para ventas B2B.`,
  },

  // ───────────────────────── Deals (global) ─────────────────────────
  {
    seedKey: 'deals-basics',
    categorySeedKey: 'deals',
    isGlobal: true,
    position: 1,
    lang: 'es',
    title: 'Crear y mover deals',
    body: `# Crear y mover deals

Un **deal** (oportunidad) representa una venta potencial.

## Crear un deal

Ve a **Deals → Nuevo deal** e indica:

- **Título** (obligatorio).
- **Valor** y **moneda**.
- **Fecha estimada de cierre**.
- **Contacto** o **empresa** asociada.
- **Prioridad** (baja / media / alta) y **etapa** del pipeline.

## Pipeline y Kanban

En **Kanban & Pipelines** ves tus deals como tarjetas en columnas (etapas). **Arrastra una tarjeta** de una columna a otra para cambiar su etapa — por ejemplo de *Contactado* a *Propuesta enviada*.

## Editar un deal

Abre el deal, cambia los campos y pulsa **Guardar**. El **valor** debe ser numérico; déjalo en 0 si aún no lo conoces.`,
  },

  // ───────────────────────── Inbox (global) ─────────────────────────
  {
    seedKey: 'inbox-conversations',
    categorySeedKey: 'inbox',
    isGlobal: true,
    position: 1,
    lang: 'es',
    title: 'Responder conversaciones',
    body: `# Responder conversaciones

El **Inbox** reúne todos tus canales (WhatsApp, llamadas, etc.) en una sola bandeja.

## Estados de una conversación

- **Serving (atendiendo)** — conversación activa.
- **Waiting (en espera)** — pendiente de respuesta.
- **Resolved (resuelta)** — cerrada. Puedes reabrirla si el cliente vuelve a escribir.

Usa las pestañas superiores para filtrar, o **All** para verlas todas.

## Responder y asignar

1. Selecciona una conversación de la lista.
2. Escribe en el cuadro inferior. **Enter** envía; **Shift + Enter** hace salto de línea (en móvil, Enter hace salto de línea).
3. En el panel derecho puedes **asignar** la conversación a un agente, equipo o cola, y añadir **notas internas** (solo visibles para tu equipo).

## Notas internas y menciones

Cambia a la pestaña **Internal note** para dejar una nota privada. Escribe **@** para mencionar a un compañero.`,
  },
  {
    seedKey: 'inbox-voice-media',
    categorySeedKey: 'inbox',
    isGlobal: true,
    position: 2,
    lang: 'es',
    title: 'Notas de voz, imágenes y archivos',
    body: `# Notas de voz, imágenes y archivos

## Enviar imágenes y archivos

Pulsa el icono de **adjuntar** en el compositor y elige la imagen o el documento. El cliente lo recibe directamente en su WhatsApp.

## Grabar y enviar notas de voz

1. Pulsa el icono de **micrófono** en el compositor.
2. Habla tu mensaje.
3. Suelta/para para revisar y **envía**.

La nota de voz se entrega como audio reproducible en WhatsApp (formato de voz nativo). Las notas de voz **entrantes** del cliente también se reproducen directamente en el Inbox.`,
  },
  {
    seedKey: 'inbox-edit-delete',
    categorySeedKey: 'inbox',
    isGlobal: true,
    position: 3,
    lang: 'es',
    title: 'Editar y borrar mensajes enviados',
    body: `# Editar y borrar mensajes enviados

¿Te equivocaste en un mensaje ya enviado? Pasa el cursor por encima del mensaje y usa las acciones:

- **Borrar** — elimina el mensaje para ambos lados (en WhatsApp aparece *"Se eliminó este mensaje"*).
- **Editar** — corrige el texto. WhatsApp permite editar **hasta 15 minutos** después de enviado.

> Estas acciones dependen de lo que permita el canal. Pasado el tiempo de edición de WhatsApp, solo podrás borrar.`,
  },
  {
    seedKey: 'inbox-whatsapp',
    categorySeedKey: 'inbox',
    isGlobal: true,
    position: 4,
    lang: 'es',
    title: 'Conectar WhatsApp',
    body: `# Conectar WhatsApp

1. Ve a **Conexiones** y pulsa **Conectar WhatsApp**.
2. Se mostrará un **código QR**.
3. En tu teléfono: WhatsApp → **Dispositivos vinculados → Vincular un dispositivo** y escanea el QR.

Cuando el estado pase a **conectado**, los mensajes empezarán a entrar en el Inbox.

## Consejos

- Mantén el teléfono con conexión a internet.
- Si el QR caduca, recárgalo y vuelve a escanear.
- Una desconexión temporal se reconecta sola; si no, repite el escaneo.`,
  },

  // ───────────────────────── Chat interno (global) ─────────────────────────
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

  // ───────────────────────── Tareas (global) ─────────────────────────
  {
    seedKey: 'tasks-manage',
    categorySeedKey: 'tasks',
    isGlobal: true,
    position: 1,
    lang: 'es',
    title: 'Gestionar tareas',
    body: `# Gestionar tareas

Las **Tareas** te ayudan a no olvidar seguimientos.

## Crear una tarea

Ve a **Tareas → Nueva tarea** e indica título, fecha de vencimiento, prioridad y responsable. Puedes vincularla a un **contacto** o **deal** para tener contexto.

## Seguimiento

Marca las tareas como completadas a medida que avanzas. Las tareas vencidas se resaltan para que las priorices.`,
  },

  // ───────────────────────── Chatbots de IA (global) ─────────────────────────
  {
    seedKey: 'chatbots-create',
    categorySeedKey: 'ai-chatbots',
    isGlobal: true,
    position: 1,
    lang: 'es',
    title: 'Crear un chatbot de IA',
    body: `# Crear un chatbot de IA

Un **chatbot de IA** responde automáticamente a tus clientes en el Inbox, 24/7.

## Pasos

1. Ve a **AI Chatbots → Nuevo chatbot**.
2. Escribe sus **instrucciones (prompt)**: cómo debe comportarse, qué tono usar y qué información puede dar. Sé concreto (ej. *"Eres el asistente de la Clínica X. Responde dudas sobre horarios y servicios. Si piden cita, ofrece agendar."*).
3. **Asígnalo a un Inbox** para que empiece a responder ese canal.

## Buenas prácticas

- Dale contexto de tu negocio (servicios, horarios, precios).
- Indícale cuándo **derivar a un humano**.
- El bot también entiende **notas de voz**: transcribe el audio del cliente y responde.

> Pruébalo escribiéndote a ti mismo antes de activarlo con clientes reales.`,
  },

  // ───────────────────────── Bots de llamada (global) ─────────────────────────
  {
    seedKey: 'callbots-use',
    categorySeedKey: 'call-bots',
    isGlobal: true,
    position: 1,
    lang: 'es',
    title: 'Usar bots de llamada',
    body: `# Usar bots de llamada

Un **bot de llamada** atiende llamadas telefónicas por voz: saluda, conversa con quien llama y registra todo en el CRM.

## Configurar tu bot

1. Ve a **Call Bots → Nuevo bot**.
2. Define sus **instrucciones (prompt)**: cómo se presenta y qué puede resolver.
3. Asígnale un **Inbox** para que cada llamada quede registrada como conversación.

## Qué ocurre en una llamada

- El bot **se adapta al idioma** de quien llama.
- Al terminar, la llamada aparece en el **Inbox** y en los **registros de llamadas**, con su **transcripción** y vinculada al **contacto**.
- Si quien llama se despide, el bot finaliza la llamada cortésmente.

> La configuración avanzada de voz (proveedor de voz, modo en tiempo real, números de teléfono) la gestiona el propietario de la plataforma.`,
  },

  // ═════════════════════════ OWNER-ONLY (no global) ═════════════════════════
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
    seedKey: 'owner-billing-plans',
    categorySeedKey: 'owner-admin',
    isGlobal: false,
    position: 2,
    lang: 'es',
    title: 'Planes, precios y facturación',
    body: `# Planes, precios y facturación

> 🔒 **Solo el propietario (owner).** Los tenants no ven este artículo.

Cada tenant tiene un **plan** que define sus límites (usuarios, contactos, conexiones, etc.).

## Gestionar planes

- Revisa y ajusta el plan de cada tenant desde la administración de tenants.
- Cuando un tenant alcanza un límite, las acciones afectadas se bloquean con un aviso (ej. crear usuarios).
- Para ampliar un límite, sube al tenant de plan.

## Buenas prácticas

- Define límites coherentes con el precio de cada plan.
- Comunica con antelación cualquier cambio de precios a los clientes.`,
  },
  {
    seedKey: 'owner-deploy-infra',
    categorySeedKey: 'owner-admin',
    isGlobal: false,
    position: 3,
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
    seedKey: 'owner-voice-callbots',
    categorySeedKey: 'owner-admin',
    isGlobal: false,
    position: 4,
    lang: 'es',
    title: 'Catálogo de voces y bots de llamada en tiempo real',
    body: `# Catálogo de voces y bots de llamada en tiempo real

> 🔒 **Solo el propietario (owner).** Los tenants no ven este artículo.

## Catálogo global de voces

En **Catálogo de Voces** defines las voces (ElevenLabs / Twilio) disponibles para que los tenants asignen a sus bots, sin que tengan que tocar credenciales.

## Modo en tiempo real (streaming)

Los bots de llamada pueden funcionar en **modo streaming** (baja latencia) usando:

- **Deepgram** para transcripción en vivo.
- **ElevenLabs** para la voz.
- **Twilio Media Streams** para el audio bidireccional, con corte por interrupción (*barge-in*).

Requisitos: claves de Deepgram y ElevenLabs configuradas, y el bloque WebSocket de Nginx para \`/call-bots/twilio/media-stream\`. En modo streaming la voz de Twilio no está disponible; usa el catálogo de voces.

## Números de teléfono

Los números de Twilio se administran desde el owner y se asignan a los bots de cada tenant.`,
  },

  // ════════════════════════════ ENGLISH (lang: 'en') ════════════════════════════

  // ───────────────────────── Getting started (global) ─────────────────────────
  {
    seedKey: 'gs-welcome-en',
    categorySeedKey: 'getting-started',
    isGlobal: true,
    position: 1,
    lang: 'en',
    title: 'Welcome to AutoMarkIQ',
    body: `# Welcome to AutoMarkIQ

AutoMarkIQ is your all-in-one CRM: manage **contacts**, **sales opportunities (deals)**, a unified **Inbox** for WhatsApp and other channels, **internal chat** for your team, and **AI assistants** that reply to messages and calls for you.

## Navigation

The sidebar is organized into sections:

- **Core CRM** — Dashboard, Contacts, Companies, Deals, Kanban, Tasks.
- **Communication** — Inbox, Internal Chat, Queues, Teams.
- **Automation** — Flows, Automations, AI Prompts, Chatbots, Call Bots.

## Recommended first steps

1. Complete **your profile** (name and photo) from the user menu, top right.
2. Invite your **team** (see *Set up your account and team*).
3. Connect **WhatsApp** to start receiving messages in the Inbox.
4. Create your first **contacts** and **deals**.

> Tip: use the search box (shortcut **Ctrl + K**) to jump quickly to any section.`,
  },
  {
    seedKey: 'gs-account-team-en',
    categorySeedKey: 'getting-started',
    isGlobal: true,
    position: 2,
    lang: 'en',
    title: 'Set up your account and team',
    body: `# Set up your account and team

## Your profile

From the user menu (top right) → **My profile** you can change your name and photo. Your availability status (**online / away / busy**) is shown to teammates in the internal chat.

## Team roles

AutoMarkIQ has three access levels:

| Role | For whom | Can |
| --- | --- | --- |
| **Admin** | Business owner | Everything in their account: users, settings, integrations, reports |
| **Agent** | Support staff | Inbox, contacts, deals and assigned tasks |

## Inviting users

If you are an **admin**, go to **Settings → Users** and click **New user**. Set their name, email, role and initial password. The user can log in right away.

> The number of users depends on your plan. If you hit the limit, get in touch to increase it.`,
  },

  // ───────────────────────── Contacts (global) ─────────────────────────
  {
    seedKey: 'contacts-manage-en',
    categorySeedKey: 'contacts',
    isGlobal: true,
    position: 1,
    lang: 'en',
    title: 'Managing contacts',
    body: `# Managing contacts

## Create a contact

Go to **Contacts → New contact**. At minimum you need a name or a phone number. Contacts are also created **automatically** when someone messages you on WhatsApp.

## Contact profile

When you open a contact you'll see:

- **Details** — name, phone, email, creation date.
- **Tags** — click **+ Tag** to classify (e.g. *Customer*, *Lead*, *VIP*). If none appear, create them first in **Settings → Tags**.
- **Custom fields** — extra information specific to your business.
- **Conversations** — chat and call history. **Click any conversation to open it in the Inbox.**

## Tags

Tags let you segment and then filter contacts or launch campaigns. A contact can have several.`,
  },
  {
    seedKey: 'contacts-companies-en',
    categorySeedKey: 'contacts',
    isGlobal: true,
    position: 2,
    lang: 'en',
    title: 'Companies',
    body: `# Companies

**Companies** group contacts that belong to the same organization.

## Create and link

1. Go to **Companies → New company**.
2. From a contact's profile you can link it to a company.

This way, when you open a company you see all of its contacts and related deals in one place — handy for B2B sales.`,
  },

  // ───────────────────────── Deals (global) ─────────────────────────
  {
    seedKey: 'deals-basics-en',
    categorySeedKey: 'deals',
    isGlobal: true,
    position: 1,
    lang: 'en',
    title: 'Create and move deals',
    body: `# Create and move deals

A **deal** (opportunity) represents a potential sale.

## Create a deal

Go to **Deals → New deal** and set:

- **Title** (required).
- **Value** and **currency**.
- **Expected close date**.
- Associated **contact** or **company**.
- **Priority** (low / medium / high) and pipeline **stage**.

## Pipeline and Kanban

In **Kanban & Pipelines** you see your deals as cards in columns (stages). **Drag a card** from one column to another to change its stage — for example from *Contacted* to *Proposal sent*.

## Edit a deal

Open the deal, change the fields and click **Save**. The **value** must be numeric; leave it at 0 if you don't know it yet.`,
  },

  // ───────────────────────── Inbox (global) ─────────────────────────
  {
    seedKey: 'inbox-conversations-en',
    categorySeedKey: 'inbox',
    isGlobal: true,
    position: 1,
    lang: 'en',
    title: 'Replying to conversations',
    body: `# Replying to conversations

The **Inbox** brings all your channels (WhatsApp, calls, etc.) into a single place.

## Conversation states

- **Serving** — active conversation.
- **Waiting** — pending a reply.
- **Resolved** — closed. You can reopen it if the customer writes again.

Use the top tabs to filter, or **All** to see every conversation.

## Reply and assign

1. Select a conversation from the list.
2. Type in the box at the bottom. **Enter** sends; **Shift + Enter** adds a new line (on mobile, Enter adds a new line).
3. In the right-hand panel you can **assign** the conversation to an agent, team or queue, and add **internal notes** (visible only to your team).

## Internal notes and mentions

Switch to the **Internal note** tab to leave a private note. Type **@** to mention a teammate.`,
  },
  {
    seedKey: 'inbox-voice-media-en',
    categorySeedKey: 'inbox',
    isGlobal: true,
    position: 2,
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
    seedKey: 'inbox-edit-delete-en',
    categorySeedKey: 'inbox',
    isGlobal: true,
    position: 3,
    lang: 'en',
    title: 'Edit and delete sent messages',
    body: `# Edit and delete sent messages

Made a mistake in a message you already sent? Hover over the message and use the actions:

- **Delete** — removes the message for both sides (in WhatsApp it shows *"This message was deleted"*).
- **Edit** — fix the text. WhatsApp allows editing **for up to 15 minutes** after sending.

> These actions depend on what the channel allows. After WhatsApp's edit window, you can only delete.`,
  },
  {
    seedKey: 'inbox-whatsapp-en',
    categorySeedKey: 'inbox',
    isGlobal: true,
    position: 4,
    lang: 'en',
    title: 'Connect WhatsApp',
    body: `# Connect WhatsApp

1. Go to **Connections** and click **Connect WhatsApp**.
2. A **QR code** will appear.
3. On your phone: WhatsApp → **Linked devices → Link a device** and scan the QR.

When the status turns to **connected**, messages will start arriving in the Inbox.

## Tips

- Keep the phone connected to the internet.
- If the QR expires, reload it and scan again.
- A temporary disconnection reconnects on its own; if not, repeat the scan.`,
  },

  // ───────────────────────── Internal chat (global) ─────────────────────────
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

  // ───────────────────────── Tasks (global) ─────────────────────────
  {
    seedKey: 'tasks-manage-en',
    categorySeedKey: 'tasks',
    isGlobal: true,
    position: 1,
    lang: 'en',
    title: 'Managing tasks',
    body: `# Managing tasks

**Tasks** help you never miss a follow-up.

## Create a task

Go to **Tasks → New task** and set a title, due date, priority and assignee. You can link it to a **contact** or **deal** for context.

## Tracking

Mark tasks as completed as you go. Overdue tasks are highlighted so you can prioritize them.`,
  },

  // ───────────────────────── AI chatbots (global) ─────────────────────────
  {
    seedKey: 'chatbots-create-en',
    categorySeedKey: 'ai-chatbots',
    isGlobal: true,
    position: 1,
    lang: 'en',
    title: 'Create an AI chatbot',
    body: `# Create an AI chatbot

An **AI chatbot** automatically replies to your customers in the Inbox, 24/7.

## Steps

1. Go to **AI Chatbots → New chatbot**.
2. Write its **instructions (prompt)**: how it should behave, what tone to use and what information it can give. Be specific (e.g. *"You are the assistant for Clinic X. Answer questions about hours and services. If they ask for an appointment, offer to schedule one."*).
3. **Assign it to an Inbox** so it starts replying on that channel.

## Best practices

- Give it context about your business (services, hours, pricing).
- Tell it when to **hand off to a human**.
- The bot also understands **voice notes**: it transcribes the customer's audio and replies.

> Test it by messaging yourself before turning it on for real customers.`,
  },

  // ───────────────────────── Call bots (global) ─────────────────────────
  {
    seedKey: 'callbots-use-en',
    categorySeedKey: 'call-bots',
    isGlobal: true,
    position: 1,
    lang: 'en',
    title: 'Using call bots',
    body: `# Using call bots

A **call bot** handles phone calls by voice: it greets, converses with the caller and logs everything in the CRM.

## Set up your bot

1. Go to **Call Bots → New bot**.
2. Define its **instructions (prompt)**: how it introduces itself and what it can resolve.
3. Assign it an **Inbox** so every call is logged as a conversation.

## What happens during a call

- The bot **adapts to the caller's language**.
- When it ends, the call appears in the **Inbox** and in the **call logs**, with its **transcript** and linked to the **contact**.
- If the caller says goodbye, the bot ends the call politely.

> Advanced voice configuration (voice provider, real-time mode, phone numbers) is managed by the platform owner.`,
  },

  // ═════════════════════════ OWNER-ONLY (no global) ═════════════════════════
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
    seedKey: 'owner-billing-plans-en',
    categorySeedKey: 'owner-admin',
    isGlobal: false,
    position: 2,
    lang: 'en',
    title: 'Plans, pricing and billing',
    body: `# Plans, pricing and billing

> 🔒 **Owner only.** Tenants do not see this article.

Each tenant has a **plan** that defines its limits (users, contacts, connections, etc.).

## Manage plans

- Review and adjust each tenant's plan from the tenant administration.
- When a tenant reaches a limit, the affected actions are blocked with a notice (e.g. creating users).
- To raise a limit, upgrade the tenant's plan.

## Best practices

- Set limits consistent with each plan's price.
- Communicate any pricing changes to customers in advance.`,
  },
  {
    seedKey: 'owner-deploy-infra-en',
    categorySeedKey: 'owner-admin',
    isGlobal: false,
    position: 3,
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
    seedKey: 'owner-voice-callbots-en',
    categorySeedKey: 'owner-admin',
    isGlobal: false,
    position: 4,
    lang: 'en',
    title: 'Voice catalog and real-time call bots',
    body: `# Voice catalog and real-time call bots

> 🔒 **Owner only.** Tenants do not see this article.

## Global voice catalog

In **Voice Catalog** you define the voices (ElevenLabs / Twilio) available for tenants to assign to their bots, without them having to touch credentials.

## Real-time mode (streaming)

Call bots can run in **streaming mode** (low latency) using:

- **Deepgram** for live transcription.
- **ElevenLabs** for the voice.
- **Twilio Media Streams** for bidirectional audio, with interruption cutoff (*barge-in*).

Requirements: Deepgram and ElevenLabs keys configured, and the Nginx WebSocket block for \`/call-bots/twilio/media-stream\`. In streaming mode the Twilio voice isn't available; use the voice catalog.

## Phone numbers

Twilio numbers are managed by the owner and assigned to each tenant's bots.`,
  },
];
