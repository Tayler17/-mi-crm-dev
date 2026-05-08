-- ============================================================
-- AutoMarkIQ – Help Center Seed (contenido global)
-- Ejecutar en prod:
--   docker exec -i crm_postgres psql -U crm -d crm_dev < scripts/help-center-seed.sql
-- ============================================================

-- Limpiar contenido global previo si existe
DELETE FROM help_articles   WHERE is_global = true;
DELETE FROM help_categories WHERE is_global = true;

-- ── CATEGORÍAS ────────────────────────────────────────────

INSERT INTO help_categories (id, tenant_id, name, icon, position, is_global, created_at, updated_at) VALUES
  ('a1000000-0000-0000-0000-000000000001', 'platform', 'Primeros pasos',   '🚀', 0, true, NOW(), NOW()),
  ('a1000000-0000-0000-0000-000000000002', 'platform', 'Conversaciones',   '💬', 1, true, NOW(), NOW()),
  ('a1000000-0000-0000-0000-000000000003', 'platform', 'Contactos',        '👥', 2, true, NOW(), NOW()),
  ('a1000000-0000-0000-0000-000000000004', 'platform', 'Conexiones',       '📥', 3, true, NOW(), NOW()),
  ('a1000000-0000-0000-0000-000000000005', 'platform', 'Chatbots con IA',  '🤖', 4, true, NOW(), NOW()),
  ('a1000000-0000-0000-0000-000000000006', 'platform', 'Bots de llamada',  '📞', 5, true, NOW(), NOW()),
  ('a1000000-0000-0000-0000-000000000007', 'platform', 'Deals & Pipeline', '📊', 6, true, NOW(), NOW()),
  ('a1000000-0000-0000-0000-000000000008', 'platform', 'Configuración',    '⚙️', 7, true, NOW(), NOW());

-- ── ARTÍCULOS ─────────────────────────────────────────────

-- ===== 1. PRIMEROS PASOS =====

INSERT INTO help_articles (id, tenant_id, category_id, title, body, video_url, position, is_published, is_global, created_at, updated_at) VALUES

('b1000000-0000-0000-0000-000000000001', 'platform', 'a1000000-0000-0000-0000-000000000001',
'¿Qué es AutoMarkIQ?',
E'# ¿Qué es AutoMarkIQ?\n\nAutoMarkIQ es una plataforma de CRM y comunicación omnicanal que centraliza todos tus canales de atención al cliente en un solo lugar.\n\n## ¿Qué puedes hacer?\n\n- **Centralizar mensajes** de WhatsApp, Instagram, Email y Webchat en una sola bandeja\n- **Automatizar atención** con chatbots de IA disponibles 24/7\n- **Llamar a clientes** con bots de voz inteligentes\n- **Gestionar oportunidades** de venta con un pipeline visual\n- **Organizar tu equipo** asignando conversaciones a los agentes adecuados\n- **Conocer a tus contactos** con historial completo de interacciones\n\n## Estructura básica\n\n| Concepto | Descripción |\n|----------|-------------|\n| **Workspace** | Tu espacio de trabajo (empresa) |\n| **Inboxes** | Los canales de comunicación conectados |\n| **Agentes** | Los miembros de tu equipo |\n| **Contactos** | Los clientes con quienes interactúas |\n| **Conversaciones** | Los hilos de mensajes activos |\n\n---\n\nSi es tu primera vez, empieza por **Configura tu cuenta** en esta misma categoría.',
NULL, 0, true, true, NOW(), NOW()),

('b1000000-0000-0000-0000-000000000002', 'platform', 'a1000000-0000-0000-0000-000000000001',
'Configura tu cuenta',
E'# Configura tu cuenta\n\nSigue estos pasos para dejar tu workspace listo en menos de 10 minutos.\n\n## Paso 1 – Completa tu perfil\n\n1. Haz clic en tu avatar en la esquina inferior del sidebar\n2. Selecciona **Mi perfil**\n3. Sube tu foto y completa nombre y cargo\n4. Guarda los cambios\n\n## Paso 2 – Personaliza el workspace\n\n1. Ve a **Configuración → General**\n2. Escribe el nombre de tu empresa\n3. Sube el logo (aparecerá en el sidebar y en el webchat)\n\n## Paso 3 – Conecta tu primer canal\n\nSin canales conectados no puedes recibir mensajes. Opciones:\n\n- 📱 **WhatsApp Business** – vía Meta Business\n- 📸 **Instagram Direct** – vía Meta Business\n- 💬 **Webchat** – widget para tu sitio web\n- 📧 **Email** – bandeja compartida del equipo\n\nVe a **Conexiones → Nueva conexión** y selecciona el canal que prefieras.\n\n## Paso 4 – Invita a tu equipo\n\nVe a **Configuración → Equipo** e invita a tus agentes por email.\n\n---\n\n> **Consejo:** Empieza con el **Webchat** — es el canal más rápido de configurar y no requiere aprobación de Meta.',
NULL, 1, true, true, NOW(), NOW()),

('b1000000-0000-0000-0000-000000000003', 'platform', 'a1000000-0000-0000-0000-000000000001',
'Invita a tu equipo',
E'# Invita a tu equipo\n\nAñade colaboradores para que atiendan conversaciones contigo.\n\n## Cómo invitar un agente\n\n1. Ve a **Configuración → Equipo**\n2. Haz clic en **Invitar agente**\n3. Ingresa el correo electrónico del colaborador\n4. Selecciona el rol (**Agente** o **Admin**)\n5. Haz clic en **Enviar invitación**\n\nEl colaborador recibirá un correo para crear su contraseña.\n\n## Roles disponibles\n\n| Rol | Qué puede hacer |\n|-----|-----------------|\n| **Agente** | Ver y responder conversaciones asignadas |\n| **Admin** | Todo lo anterior + gestionar inboxes, contactos y configuración |\n| **Owner** | Acceso total incluyendo facturación y plataforma |\n\n## Gestionar miembros existentes\n\n- **Cambiar rol**: haz clic en los tres puntos → Cambiar rol\n- **Desactivar**: el usuario no puede iniciar sesión pero sus datos se conservan\n- **Eliminar**: acción permanente, reasigna sus conversaciones activas antes\n\n---\n\n> **Nota:** Dependiendo de tu plan puede haber un límite máximo de agentes. Revísalo en **Configuración → Facturación**.',
NULL, 2, true, true, NOW(), NOW()),

('b1000000-0000-0000-0000-000000000004', 'platform', 'a1000000-0000-0000-0000-000000000001',
'Tour del dashboard',
E'# Tour del dashboard\n\nAl iniciar sesión verás el dashboard principal. Aquí te explicamos cada sección.\n\n## Sidebar izquierdo\n\n| Icono | Sección | Para qué sirve |\n|-------|---------|----------------|\n| 💬 | Conversaciones | Bandeja de entrada omnicanal |\n| 👥 | Contactos | Base de datos de clientes |\n| 📊 | Deals | Pipeline de ventas |\n| 🤖 | Chatbots IA | Bots de texto automatizados |\n| 📞 | Bots de llamada | Bots de voz con IA |\n| 📣 | Campañas | Envíos masivos |\n| 📅 | Citas | Agenda y reservas |\n| 📋 | Tareas | Seguimiento interno |\n| 📢 | Anuncios | Comunicados internos al equipo |\n| ⚙️ | Configuración | Ajustes del workspace |\n| ❓ | Ayuda | Este centro de ayuda |\n\n## Panel de conversaciones\n\nDentro de **Conversaciones** verás tres columnas:\n\n1. **Lista de inboxes** – filtra por canal\n2. **Lista de conversaciones** – ordenadas por más reciente\n3. **Hilo activo** – el chat seleccionado con historial completo\n\n## Métricas del dashboard\n\nEn la pantalla de inicio verás: conversaciones abiertas, resueltas hoy, tiempo de primera respuesta y agentes activos.',
NULL, 3, true, true, NOW(), NOW());

-- ===== 2. CONVERSACIONES =====

INSERT INTO help_articles (id, tenant_id, category_id, title, body, video_url, position, is_published, is_global, created_at, updated_at) VALUES

('b1000000-0000-0000-0000-000000000010', 'platform', 'a1000000-0000-0000-0000-000000000002',
'Cómo funciona la bandeja de entrada',
E'# Cómo funciona la bandeja de entrada\n\nLa bandeja centraliza todos los mensajes de tus canales en un solo lugar.\n\n## Estados de una conversación\n\n| Estado | Descripción |\n|--------|-------------|\n| **Abierta** | Requiere atención del equipo |\n| **Pendiente** | En espera de respuesta del cliente |\n| **Resuelta** | Atención completada |\n| **Spam** | Marcada como no deseada |\n\n## Filtros disponibles\n\n- Por **inbox** (WhatsApp, Instagram, Webchat, Email)\n- Por **agente asignado**\n- Por **estado** (abierta / pendiente / resuelta)\n- Por **etiquetas**\n\n## Dentro de una conversación\n\n- **Historial completo** de mensajes del canal\n- **Panel lateral derecho** con datos del contacto\n- **Barra de respuesta** con texto, emoji y adjuntos\n- **Pestaña Notas** para comunicación interna del equipo\n\n## Resolver una conversación\n\nCuando termines de atender a un cliente, haz clic en **Resolver** (botón verde arriba a la derecha). La conversación pasará al estado Resuelta y saldrá de la bandeja activa.',
NULL, 0, true, true, NOW(), NOW()),

('b1000000-0000-0000-0000-000000000011', 'platform', 'a1000000-0000-0000-0000-000000000002',
'Asignar y reasignar conversaciones',
E'# Asignar y reasignar conversaciones\n\nAsignar conversaciones garantiza que cada cliente sea atendido por la persona correcta.\n\n## Asignar a un agente\n\n1. Abre la conversación\n2. En el panel derecho busca **Agente asignado**\n3. Haz clic en el desplegable y selecciona un agente\n4. El agente recibirá una notificación\n\n## Asignación automática por chatbot\n\nCuando un chatbot de IA no puede resolver una consulta, puede **escalar automáticamente** a un agente humano.\n\nConfigúralo en: **Chatbots IA → tu bot → Comportamiento → Escalar si no sabe**.\n\n## Reasignar una conversación\n\n1. Abre la conversación\n2. En el panel derecho cambia el agente en el desplegable\n3. El nuevo agente la verá en su bandeja\n\n## Buenas prácticas\n\n- Asigna ventas al equipo comercial\n- Asigna soporte técnico al equipo de ayuda\n- Usa etiquetas para facilitar la búsqueda posterior\n- Si vas a estar ausente, reasigna tus conversaciones activas',
NULL, 1, true, true, NOW(), NOW()),

('b1000000-0000-0000-0000-000000000012', 'platform', 'a1000000-0000-0000-0000-000000000002',
'Notas internas',
E'# Notas internas\n\nLas notas son mensajes visibles solo para tu equipo — el cliente nunca las ve.\n\n## Cómo escribir una nota\n\n1. Abre la conversación\n2. En la barra inferior, haz clic en la pestaña **Nota**\n3. Escribe tu comentario\n4. Haz clic en **Añadir nota**\n\nLas notas aparecen con fondo amarillo para diferenciarlas de los mensajes del cliente.\n\n## ¿Para qué usarlas?\n\n- Dejar contexto para el siguiente agente que tome la conversación\n- Registrar acuerdos verbales con el cliente\n- Coordinar con el equipo sin que el cliente lo vea\n- Anotar información relevante sobre el caso\n\n## Mencionar a un compañero\n\nEscribe `@nombre` dentro de la nota para notificar a un agente específico. Recibirá una notificación en la plataforma.',
NULL, 2, true, true, NOW(), NOW()),

('b1000000-0000-0000-0000-000000000013', 'platform', 'a1000000-0000-0000-0000-000000000002',
'Etiquetas y filtros',
E'# Etiquetas y filtros\n\nLas etiquetas categorizan conversaciones para encontrarlas fácilmente.\n\n## Añadir una etiqueta\n\n1. Abre la conversación\n2. En el panel derecho, busca la sección **Etiquetas**\n3. Escribe el nombre y presiona Enter\n4. Puedes añadir varias etiquetas a la misma conversación\n\n## Ejemplos de etiquetas útiles\n\n- `venta-caliente` – leads con intención de compra inmediata\n- `soporte` – consultas de ayuda técnica\n- `seguimiento` – clientes que necesitan un follow-up\n- `prioridad-alta` – casos urgentes\n- `pagó` – clientes que completaron una compra\n\n## Filtrar por etiqueta\n\n1. En la bandeja de entrada usa el filtro **Etiqueta**\n2. Selecciona la etiqueta que quieres ver\n3. Verás solo las conversaciones con esa etiqueta\n\n## Resolver en lote\n\nSelecciona varias conversaciones con la casilla de verificación y usa **Resolver seleccionadas** para cerrarlas todas a la vez.',
NULL, 3, true, true, NOW(), NOW());

-- ===== 3. CONTACTOS =====

INSERT INTO help_articles (id, tenant_id, category_id, title, body, video_url, position, is_published, is_global, created_at, updated_at) VALUES

('b1000000-0000-0000-0000-000000000020', 'platform', 'a1000000-0000-0000-0000-000000000003',
'Crear y gestionar contactos',
E'# Crear y gestionar contactos\n\nLos contactos son la base de datos de clientes y prospectos de tu workspace.\n\n## Crear un contacto manualmente\n\n1. Ve a **Contactos** en el sidebar\n2. Haz clic en **Nuevo contacto**\n3. Completa los campos:\n   - Nombre y apellido\n   - Teléfono (con código de país, ej: +34600000000)\n   - Email\n   - Empresa\n4. Haz clic en **Guardar**\n\n## Información disponible por contacto\n\n- **Datos básicos** – nombre, teléfono, email, empresa\n- **Conversaciones** – historial de todas las interacciones\n- **Deals** – oportunidades de venta asociadas\n- **Notas** – apuntes sobre el cliente\n- **Actividad** – registro cronológico de eventos\n\n## Buscar un contacto\n\nUsa la barra de búsqueda en **Contactos** para buscar por nombre, teléfono o email.\n\n## Editar o eliminar\n\n- **Editar**: tres puntos (...) → Editar\n- **Eliminar**: tres puntos → Eliminar (acción irreversible)\n\n> **Nota:** Si eliminas un contacto, sus conversaciones históricas se mantienen pero quedan sin contacto asociado.',
NULL, 0, true, true, NOW(), NOW()),

('b1000000-0000-0000-0000-000000000021', 'platform', 'a1000000-0000-0000-0000-000000000003',
'Importar contactos desde CSV',
E'# Importar contactos desde CSV\n\nCarga cientos de contactos de una sola vez con un archivo CSV.\n\n## Formato del archivo\n\n```\nnombre,apellido,telefono,email,empresa\nJuan,García,+34600000001,juan@empresa.com,Empresa SA\nMaría,López,+34600000002,maria@otro.com,\n```\n\n- Primera fila: encabezados\n- Teléfono con código de país (`+34`, `+52`, `+1`, etc.)\n- Campos vacíos son válidos excepto `nombre`\n\n## Pasos para importar\n\n1. Ve a **Contactos**\n2. Haz clic en **Importar** (ícono de subida)\n3. Selecciona tu archivo `.csv`\n4. Revisa la vista previa\n5. Haz clic en **Confirmar importación**\n\n## Contactos duplicados\n\nSi ya existe un contacto con el mismo teléfono o email, el sistema lo **actualizará** en lugar de duplicarlo.\n\n## Límites por plan\n\n| Plan | Máximo de contactos |\n|------|--------------------|\n| Free | 500 |\n| Pro | 5,000 |\n| Business | Ilimitado |\n\nRevisa tu plan en **Configuración → Facturación**.',
NULL, 1, true, true, NOW(), NOW()),

('b1000000-0000-0000-0000-000000000022', 'platform', 'a1000000-0000-0000-0000-000000000003',
'Historial y actividad de un contacto',
E'# Historial y actividad de un contacto\n\nCada contacto tiene un registro completo de toda su interacción con tu empresa.\n\n## Ver el historial\n\n1. Ve a **Contactos** y abre el contacto\n2. Navega por las pestañas:\n   - **Conversaciones** – todos los hilos de chat, de cualquier canal\n   - **Deals** – oportunidades de venta vinculadas\n   - **Actividad** – línea de tiempo de eventos\n\n## Qué aparece en la actividad\n\n- Fecha de primera conversación\n- Cambios de agente asignado\n- Deals creados o actualizados\n- Notas añadidas\n- Cambios de etiqueta\n\n## Vincular un deal al contacto\n\n1. Abre el contacto → pestaña **Deals**\n2. Haz clic en **Añadir deal**\n3. Completa nombre, valor y etapa del pipeline\n\n## Ver conversaciones históricas\n\nDesde la pestaña **Conversaciones** puedes acceder directamente a cualquier hilo anterior sin importar desde qué canal llegó el cliente.',
NULL, 2, true, true, NOW(), NOW());

-- ===== 4. CONEXIONES =====

INSERT INTO help_articles (id, tenant_id, category_id, title, body, video_url, position, is_published, is_global, created_at, updated_at) VALUES

('b1000000-0000-0000-0000-000000000030', 'platform', 'a1000000-0000-0000-0000-000000000004',
'Conectar WhatsApp Business (Meta)',
E'# Conectar WhatsApp Business\n\nAutoMarkIQ se conecta a WhatsApp a través de la API oficial de Meta Business.\n\n## Requisitos previos\n\n- Cuenta en **Meta Business Manager** (business.facebook.com)\n- Número de teléfono **no vinculado** a WhatsApp personal\n- App Meta configurada por el administrador de la plataforma\n\n## Pasos para conectar\n\n1. Ve a **Conexiones → Nueva conexión**\n2. Selecciona **WhatsApp Business**\n3. Haz clic en **Conectar con Facebook**\n4. Inicia sesión con tu cuenta de Meta Business\n5. Selecciona la página de Facebook vinculada a tu negocio\n6. Selecciona (o crea) el número de WhatsApp Business\n7. Autoriza los permisos solicitados\n8. El inbox aparecerá activo en tu lista\n\n## Verificar que funciona\n\nEnvía un mensaje al número desde otro teléfono. Deberías verlo en **Conversaciones** en segundos.\n\n## Limitaciones de la API oficial\n\n- Solo puedes iniciar conversaciones con plantillas pre-aprobadas por Meta\n- Las respuestas a mensajes entrantes son libres durante **24 horas**\n- Mensajes de marketing requieren aprobación previa de plantillas\n\n> Si tienes problemas con la conexión, contacta al administrador de tu plataforma.',
NULL, 0, true, true, NOW(), NOW()),

('b1000000-0000-0000-0000-000000000031', 'platform', 'a1000000-0000-0000-0000-000000000004',
'Conectar Instagram Direct',
E'# Conectar Instagram Direct\n\nRecibe y responde mensajes directos de Instagram desde AutoMarkIQ.\n\n## Requisitos previos\n\n- Cuenta de **Instagram Business** (no personal)\n- Instagram Business vinculada a una **Página de Facebook**\n- Permisos de administrador en la página de Facebook\n\n## Pasos para conectar\n\n1. Ve a **Conexiones → Nueva conexión**\n2. Selecciona **Instagram**\n3. Haz clic en **Conectar con Facebook**\n4. Inicia sesión con tu cuenta de Meta\n5. Selecciona la página de Facebook vinculada a tu cuenta de Instagram Business\n6. Autoriza los permisos de mensajería\n7. El inbox de Instagram quedará activo\n\n## ¿Qué mensajes recibirás?\n\n- Mensajes directos (DM) de usuarios\n- Respuestas a Stories cuando el usuario envía DM desde la story\n\n## Verificar que funciona\n\nEnvía un DM de prueba desde otra cuenta de Instagram. Debería aparecer en **Conversaciones** en pocos segundos.\n\n> **Consejo:** Activa los mensajes en la configuración de tu página de Facebook en Meta Business Suite para que el webhook funcione correctamente.',
NULL, 1, true, true, NOW(), NOW()),

('b1000000-0000-0000-0000-000000000032', 'platform', 'a1000000-0000-0000-0000-000000000004',
'Activar el Webchat en tu sitio web',
E'# Activar el Webchat en tu sitio web\n\nEl Webchat es un widget de chat que aparece en tu sitio y permite que visitantes te escriban en tiempo real.\n\n## Crear el inbox de Webchat\n\n1. Ve a **Conexiones → Nueva conexión**\n2. Selecciona **Webchat**\n3. Asigna un nombre (ej: "Chat del sitio web")\n4. Personaliza color y mensaje de bienvenida\n5. Haz clic en **Crear**\n\n## Obtener el código de instalación\n\n1. Abre el inbox de Webchat creado\n2. Ve a la pestaña **Instalación**\n3. Copia el snippet de JavaScript\n\n## Instalar en tu sitio\n\n- **WordPress**: pega en Apariencia → Editor de temas → footer.php antes de `</body>`\n- **Shopify**: pega en Tienda Online → Temas → Editar código → theme.liquid antes de `</body>`\n- **HTML puro**: pega antes del cierre `</body>` en tu archivo HTML\n- **React/Next.js**: úsalo en un componente con `useEffect` o con el componente `<Script>`\n\n## Verificar instalación\n\n1. Visita tu sitio web\n2. Verás el botón de chat en la esquina inferior derecha\n3. Envía un mensaje de prueba y verifica que llega en AutoMarkIQ',
NULL, 2, true, true, NOW(), NOW()),

('b1000000-0000-0000-0000-000000000033', 'platform', 'a1000000-0000-0000-0000-000000000004',
'Canal de Email',
E'# Canal de Email\n\nGestiona los correos de tu empresa desde la misma bandeja que el resto de canales.\n\n## Opción A – Email propio (SMTP/IMAP)\n\n1. Ve a **Conexiones → Nueva conexión → Email**\n2. Ingresa tu dirección de email\n3. Configura los datos SMTP (servidor, puerto, usuario, contraseña)\n4. Configura IMAP para recepción de correos\n5. Haz clic en **Verificar y guardar**\n\nFunciona con Gmail, Outlook, Zoho, o cualquier proveedor IMAP/SMTP.\n\n## Opción B – Dirección de reenvío\n\n1. Crea el inbox de Email en AutoMarkIQ\n2. Copia la dirección de reenvío generada\n3. Configura en tu proveedor de email el reenvío automático hacia esa dirección\n\n## Lo que verás en la bandeja\n\n- Asunto del email como título de conversación\n- Hilo de respuestas agrupado\n- Archivos adjuntos descargables\n- Responder directamente desde AutoMarkIQ\n\n> **Ideal para:** equipos de soporte que reciben tickets por correo y quieren centralizarlos junto a sus otros canales.',
NULL, 3, true, true, NOW(), NOW());

-- ===== 5. CHATBOTS CON IA =====

INSERT INTO help_articles (id, tenant_id, category_id, title, body, video_url, position, is_published, is_global, created_at, updated_at) VALUES

('b1000000-0000-0000-0000-000000000040', 'platform', 'a1000000-0000-0000-0000-000000000005',
'Crear tu primer chatbot de IA',
E'# Crear tu primer chatbot de IA\n\nLos chatbots de IA responden automáticamente a tus clientes usando inteligencia artificial, disponibles 24/7.\n\n## Antes de empezar\n\nEl administrador de la plataforma debe haber configurado una API Key de IA en **Configuración → Plataforma → IA**. Sin ella el bot no funcionará.\n\n## Crear el chatbot\n\n1. Ve a **Chatbots IA** en el sidebar\n2. Haz clic en **Nuevo chatbot**\n3. Completa:\n   - **Nombre**: identificador interno (ej: "Bot de ventas")\n   - **Proveedor**: OpenAI, Anthropic u Ollama\n   - **Modelo**: GPT-4o, Claude 3.5, etc.\n4. Haz clic en **Crear**\n\n## Configurar el comportamiento\n\nUna vez creado:\n\n- **Prompt del sistema**: define cómo debe comportarse (tono, rol, limitaciones)\n- **Temperatura**: creatividad de respuestas (0 = preciso, 1 = creativo)\n- **Mensaje de bienvenida**: lo primero que ve el cliente\n- **Escalar a humano**: condiciones para pasar la conversación a un agente\n\n## Activar en un canal\n\n1. Abre el chatbot\n2. Ve a la pestaña **Inboxes**\n3. Selecciona los canales donde quieres activarlo\n4. Activa el toggle\n\nDesde ese momento el bot responderá automáticamente en esos canales.',
NULL, 0, true, true, NOW(), NOW()),

('b1000000-0000-0000-0000-000000000041', 'platform', 'a1000000-0000-0000-0000-000000000005',
'Configurar el comportamiento y prompts',
E'# Configurar el comportamiento y prompts\n\nEl prompt del sistema es la instrucción principal que le dice a la IA cómo actuar.\n\n## Estructura de un buen prompt\n\n1. **Rol**: qué es el bot\n2. **Empresa**: información sobre el negocio\n3. **Objetivo**: qué debe lograr\n4. **Tono**: formal, amigable, técnico\n5. **Límites**: qué NO debe responder\n\n## Ejemplo de prompt\n\n```\nEres el asistente virtual de [Empresa], una tienda de ropa online.\nAyuda a los clientes con:\n- Consultas sobre productos y tallas\n- Estado de pedidos\n- Política de devoluciones\n\nTono: amigable y profesional. Usa el nombre del cliente si lo conoces.\n\nSi preguntan algo fuera de estos temas, indícales que los conectarás\ncon un asesor usando la frase: "déjame conectarte con un asesor".\n\nNunca inventes precios o disponibilidad.\n```\n\n## Parámetros avanzados\n\n| Parámetro | Descripción | Recomendado |\n|-----------|-------------|-------------|\n| Temperatura | Creatividad (0–1) | 0.3–0.5 soporte / 0.7 ventas |\n| Tokens máx. | Longitud de respuesta | 500–800 |\n| Escalar si no sabe | Pasa a humano automáticamente | Siempre activar |\n\n## Buenas prácticas\n\n- Sé específico sobre lo que el bot puede y no puede hacer\n- Incluye preguntas frecuentes reales del negocio\n- Prueba con el botón **Probar mensaje** antes de activar en producción',
NULL, 1, true, true, NOW(), NOW()),

('b1000000-0000-0000-0000-000000000042', 'platform', 'a1000000-0000-0000-0000-000000000005',
'Probar el chatbot antes de activar',
E'# Probar el chatbot antes de activar\n\nAntes de activar el bot en un canal real, pruébalo sin afectar a los clientes.\n\n## Cómo probar\n\n1. Abre el chatbot\n2. Haz clic en **Probar mensaje**\n3. Escribe una pregunta como si fueras un cliente\n4. Revisa la respuesta generada\n\n## Qué revisar\n\n- ¿La respuesta es correcta y coherente?\n- ¿El tono es el adecuado?\n- ¿Respeta los límites del prompt?\n- ¿La longitud es apropiada?\n\n## Casos de prueba recomendados\n\n| Caso | Qué esperar |\n|------|-------------|\n| Pregunta típica del negocio | Respuesta precisa |\n| Pregunta fuera de tema | Declina educadamente |\n| Pregunta ambigua | Pide aclaración |\n| "Quiero hablar con una persona" | Escala a agente humano |\n| Palabras groseras | Responde con calma o escala |\n\n## Ajustar según resultados\n\nSi las respuestas no son las esperadas:\n\n1. Modifica el **prompt del sistema** para ser más específico\n2. Reduce la **temperatura** si las respuestas son demasiado creativas\n3. Añade ejemplos concretos de preguntas y respuestas al prompt\n4. Vuelve a probar hasta que el comportamiento sea el correcto',
NULL, 2, true, true, NOW(), NOW());

-- ===== 6. BOTS DE LLAMADA =====

INSERT INTO help_articles (id, tenant_id, category_id, title, body, video_url, position, is_published, is_global, created_at, updated_at) VALUES

('b1000000-0000-0000-0000-000000000050', 'platform', 'a1000000-0000-0000-0000-000000000006',
'¿Qué son los bots de llamada?',
E'# ¿Qué son los bots de llamada?\n\nLos bots de llamada son agentes de voz automatizados que realizan o reciben llamadas telefónicas usando inteligencia artificial y síntesis de voz.\n\n## ¿Para qué sirven?\n\n- **Llamadas de seguimiento** a leads o clientes\n- **Confirmación de citas** o reservas\n- **Encuestas de satisfacción** automatizadas\n- **Recordatorios de pago** o vencimientos\n- **Atención inbound** fuera del horario de oficina\n\n## Cómo funciona\n\n1. El bot llama (o recibe la llamada) en el número asignado\n2. Reproduce un saludo personalizado\n3. Escucha la respuesta del cliente usando reconocimiento de voz\n4. La IA procesa la respuesta y contesta de forma natural\n5. La conversación queda registrada con transcripción y duración\n\n## Tecnología utilizada\n\n- **Twilio**: proveedor de telefonía (llamadas y números)\n- **ElevenLabs** (opcional): voz más natural y expresiva\n- **OpenAI / Anthropic**: IA para procesar el diálogo\n\n## Requisitos\n\n- El administrador debe tener configurado Twilio con números disponibles\n- Se requieren créditos de llamadas en la cuenta Twilio\n\n> Esta función está disponible en planes **Pro** y superiores.',
NULL, 0, true, true, NOW(), NOW()),

('b1000000-0000-0000-0000-000000000051', 'platform', 'a1000000-0000-0000-0000-000000000006',
'Crear y configurar un bot de llamada',
E'# Crear y configurar un bot de llamada\n\n## Crear el bot\n\n1. Ve a **Bots de llamada** en el sidebar\n2. Haz clic en **Nuevo bot**\n3. Completa los datos:\n   - **Nombre**: identificador interno (ej: "Bot de seguimiento comercial")\n   - **Número de teléfono**: selecciona del pool disponible\n   - **Voz**: elige entre las voces disponibles\n4. Haz clic en **Crear**\n\n## Configurar el comportamiento\n\n### Mensaje de saludo\nLo primero que escucha el cliente. Sé claro y directo:\n```\nHola, te llamo de [Empresa]. ¿Tienes un momento para hablar?\n```\n\n### Prompt del sistema\nDefine el objetivo de la llamada:\n```\nEres un asistente de ventas de [Empresa]. Tu objetivo es confirmar\nsi el cliente recibió nuestra propuesta y si tiene alguna duda.\nSé amable. Si no quiere hablar, agradece su tiempo y termina la llamada.\n```\n\n### Configuración de voz\n- **Velocidad**: ajusta el ritmo del habla\n- **ElevenLabs**: actívalo si está disponible para voz más natural\n\n## Hacer una llamada de prueba\n\n1. Abre el bot configurado\n2. Haz clic en **Llamar ahora**\n3. Ingresa tu número de teléfono\n4. Recibe la llamada y verifica el comportamiento\n5. Revisa la transcripción en los logs',
NULL, 1, true, true, NOW(), NOW()),

('b1000000-0000-0000-0000-000000000052', 'platform', 'a1000000-0000-0000-0000-000000000006',
'Ver logs de llamadas',
E'# Ver logs de llamadas\n\nCada llamada queda registrada con información detallada.\n\n## Acceder a los logs\n\n1. Ve a **Bots de llamada**\n2. Haz clic en la pestaña **Logs**\n3. Verás todas las llamadas del workspace\n\n## Información en cada log\n\n| Campo | Descripción |\n|-------|-------------|\n| Fecha y hora | Cuándo ocurrió la llamada |\n| Número | Teléfono del cliente |\n| Duración | Tiempo total de la llamada |\n| Estado | Completada / Sin respuesta / Ocupado / Fallida |\n| Bot | Qué bot gestionó la llamada |\n| Transcripción | Texto completo de la conversación |\n\n## Filtrar logs\n\n- Por **bot** específico\n- Por **fecha** (rango)\n- Por **estado**\n\n## Leer la transcripción\n\nHaz clic en cualquier log para ver la conversación completa. Úsala para:\n- Auditar la calidad del bot\n- Detectar preguntas que el bot no supo responder\n- Mejorar el prompt del sistema\n\n> **Consejo:** Revisa los logs una vez a la semana para identificar mejoras en el comportamiento del bot.',
NULL, 2, true, true, NOW(), NOW());

-- ===== 7. DEALS & PIPELINE =====

INSERT INTO help_articles (id, tenant_id, category_id, title, body, video_url, position, is_published, is_global, created_at, updated_at) VALUES

('b1000000-0000-0000-0000-000000000060', 'platform', 'a1000000-0000-0000-0000-000000000007',
'Gestionar oportunidades (Deals)',
E'# Gestionar oportunidades (Deals)\n\nLos deals representan oportunidades de venta que puedes rastrear a través de las etapas de tu proceso comercial.\n\n## ¿Qué es un deal?\n\nUn deal contiene:\n- **Nombre**: descripción del negocio\n- **Valor**: monto estimado de la venta\n- **Contacto**: cliente asociado\n- **Etapa**: punto del pipeline donde se encuentra\n- **Agente**: responsable del seguimiento\n- **Fecha de cierre estimada**\n\n## Crear un deal\n\n### Desde el Pipeline\n1. Ve a **Deals**\n2. Haz clic en **+ Nuevo deal** en la columna deseada\n3. Completa los datos y haz clic en **Crear**\n\n### Desde un contacto\n1. Abre el contacto en **Contactos**\n2. Ve a la pestaña **Deals** → **Añadir deal**\n\n## Vista pipeline (Kanban)\n\n- **Arrastra y suelta** deals entre columnas\n- **Valor total** de cada etapa visible en la cabecera\n- **Filtra** por agente, etiqueta o fechas\n\n## Actualizar un deal\n\nHaz clic en cualquier deal para editarlo:\n- Cambiar de etapa\n- Actualizar el valor estimado\n- Añadir notas de seguimiento\n- Asociar otro contacto',
NULL, 0, true, true, NOW(), NOW()),

('b1000000-0000-0000-0000-000000000061', 'platform', 'a1000000-0000-0000-0000-000000000007',
'Crear pipelines personalizados',
E'# Crear pipelines personalizados\n\nCada pipeline tiene sus propias etapas adaptadas a tu proceso de venta.\n\n## Crear un pipeline\n\n1. Ve a **Deals**\n2. Haz clic en el selector de pipeline (arriba a la izquierda)\n3. Selecciona **Nuevo pipeline**\n4. Escribe el nombre (ej: "Ventas B2B", "Proyectos")\n5. Haz clic en **Crear**\n\n## Configurar etapas\n\n1. Con el pipeline activo, haz clic en **Configurar etapas**\n2. Etapas por defecto: Nuevo → Calificado → Propuesta → Negociación → Cerrado\n3. **Añadir etapa**: haz clic en **+ Añadir etapa**\n4. **Renombrar**: haz clic en el nombre de la etapa\n5. **Reordenar**: arrastra a la posición deseada\n6. **Eliminar**: usa el ícono de papelera (los deals se moverán a "Sin etapa")\n\n## Ejemplos por industria\n\n**Agencia de marketing:**\nProspecto → Brief recibido → Propuesta enviada → Negociando → Proyecto activo\n\n**Inmobiliaria:**\nInteresado → Visita agendada → Oferta → Notaría → Cerrado\n\n**E-commerce B2B:**\nContacto inicial → Muestra enviada → Pedido de prueba → Cliente recurrente\n\n## Buenas prácticas\n\n- Crea un pipeline por tipo de negocio\n- Máximo 6-7 etapas por pipeline\n- La última etapa siempre debe indicar el resultado final (ganado / perdido)',
NULL, 1, true, true, NOW(), NOW());

-- ===== 8. CONFIGURACIÓN =====

INSERT INTO help_articles (id, tenant_id, category_id, title, body, video_url, position, is_published, is_global, created_at, updated_at) VALUES

('b1000000-0000-0000-0000-000000000070', 'platform', 'a1000000-0000-0000-0000-000000000008',
'Configurar tu perfil',
E'# Configurar tu perfil\n\nPersonaliza tu cuenta individual dentro del workspace.\n\n## Acceder a tu perfil\n\n1. Haz clic en tu avatar en la esquina inferior del sidebar\n2. Selecciona **Mi perfil**\n\n## Qué puedes configurar\n\n### Información personal\n- **Nombre completo** – aparece en las conversaciones asignadas a ti\n- **Foto de perfil** – visible para tus compañeros\n- **Cargo** – descripción de tu rol\n\n### Seguridad\n- **Cambiar contraseña**: ingresa tu contraseña actual y la nueva\n- Usa contraseñas de al menos 8 caracteres con letras y números\n\n### Notificaciones\n- Activa/desactiva notificaciones de nuevas conversaciones\n- Configura sonidos de alerta\n- Selecciona qué inboxes monitorear\n\n### Disponibilidad\n- **Disponible**: recibes conversaciones nuevas\n- **Ocupado**: no recibes asignaciones automáticas\n- **Fuera de línea**: apareces como inactivo\n\n## Cerrar sesión\n\nHaz clic en tu avatar → **Cerrar sesión**. Tu cuenta y datos permanecen intactos.',
NULL, 0, true, true, NOW(), NOW()),

('b1000000-0000-0000-0000-000000000071', 'platform', 'a1000000-0000-0000-0000-000000000008',
'Gestionar el equipo y roles',
E'# Gestionar el equipo y roles\n\nSolo **Admin** y **Owner** pueden gestionar el equipo.\n\n## Ver el equipo\n\nVe a **Configuración → Equipo** para ver todos los miembros con su rol y estado.\n\n## Invitar nuevos miembros\n\n1. Haz clic en **Invitar agente**\n2. Ingresa el email del colaborador\n3. Selecciona el rol\n4. Haz clic en **Enviar invitación**\n\nEl colaborador recibirá un correo para activar su cuenta.\n\n## Roles del sistema\n\n| Rol | Permisos |\n|-----|----------|\n| **Agente** | Ver y responder conversaciones, gestionar contactos básicos |\n| **Admin** | Todo lo anterior + gestionar equipo, inboxes y configuración |\n| **Owner** | Acceso total: facturación, plataforma, contenido global |\n\n## Cambiar el rol de un miembro\n\n1. Tres puntos junto al miembro → **Cambiar rol**\n2. Selecciona el nuevo rol y confirma\n\n## Desactivar o eliminar un miembro\n\n- **Desactivar**: el usuario no puede iniciar sesión pero sus datos se conservan\n- **Eliminar**: permanente — reasigna sus conversaciones activas antes\n\n> No puedes degradar o eliminar al Owner de la cuenta.',
NULL, 1, true, true, NOW(), NOW()),

('b1000000-0000-0000-0000-000000000072', 'platform', 'a1000000-0000-0000-0000-000000000008',
'Planes y facturación',
E'# Planes y facturación\n\nGestiona tu suscripción y revisa los límites de tu plan actual.\n\n## Ver tu plan actual\n\nVe a **Configuración → Facturación** para ver tu plan activo, fecha de renovación y uso actual.\n\n## Comparación de planes\n\n| Característica | Free | Pro | Business |\n|----------------|:----:|:---:|:--------:|\n| Agentes | 2 | 10 | Ilimitados |\n| Contactos | 500 | 5,000 | Ilimitados |\n| Inboxes | 1 | 5 | Ilimitados |\n| Chatbots IA | ❌ | 3 | Ilimitados |\n| Bots de llamada | ❌ | 1 | Ilimitados |\n| Minutos de llamada | ❌ | 200/mes | Ilimitados |\n\n## Cambiar de plan\n\n1. Haz clic en **Cambiar plan**\n2. Selecciona el plan deseado\n3. Ingresa los datos de pago\n4. El cambio es inmediato\n\n## Preguntas frecuentes\n\n**¿Puedo cancelar en cualquier momento?**\nSí. Tu plan activo se mantiene hasta el final del período pagado.\n\n**¿Qué pasa si supero los límites?**\nLas funciones que excedan el límite quedarán bloqueadas hasta renovar o actualizar.\n\n**¿Hay período de prueba?**\nEl plan Free es gratuito sin límite de tiempo. Puedes actualizar cuando lo necesites.\n\n> ¿Necesitas un plan personalizado para tu empresa? Contáctanos a través del chat de soporte.',
NULL, 2, true, true, NOW(), NOW()),

('b1000000-0000-0000-0000-000000000073', 'platform', 'a1000000-0000-0000-0000-000000000008',
'Configuración general del workspace',
E'# Configuración general del workspace\n\nPersonaliza cómo aparece tu empresa en la plataforma.\n\n## Acceder\n\nVe a **Configuración → General**.\n\n## Qué puedes configurar\n\n### Identidad\n- **Nombre de la empresa** – aparece en el sidebar y comunicaciones\n- **Logo** – visible en el panel y en el Webchat\n- **Color de marca** – personaliza el widget de chat\n\n### Horario de atención\n- Define días y horas de disponibilidad del equipo\n- Fuera de horario puedes configurar un mensaje automático\n- Los chatbots operan 24/7 independientemente de este horario\n\n### Mensaje de ausencia\nTexto que reciben los clientes fuera del horario de atención:\n\n```\nGracias por contactarnos. Nuestro horario es L–V de 9:00 a 18:00.\nTe responderemos a la brevedad.\n```\n\n### Zona horaria\nImportante para que los reportes y horarios de bots sean correctos. Selecciona la zona horaria de tu empresa.\n\n## Guardar cambios\n\nHaz clic en **Guardar** después de cada modificación. Los cambios son inmediatos.',
NULL, 3, true, true, NOW(), NOW());
