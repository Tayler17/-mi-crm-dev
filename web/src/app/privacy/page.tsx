import Link from 'next/link';

export const metadata = { title: 'Política de privacidad — CRM SaaS' };

const LAST_UPDATED = '24 de abril de 2026';

export default function PrivacyPage() {
  return (
    <div style={{ fontFamily: 'Inter, system-ui, sans-serif', minHeight: '100vh', background: '#f8fafc' }}>

      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '16px 0' }}>
        <div style={{ maxWidth: 820, margin: '0 auto', padding: '0 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>⚡</div>
            <span style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.5px' }}>CRM SaaS</span>
          </Link>
          <Link href="/terms" style={{ fontSize: 13, color: '#6366f1', textDecoration: 'none', fontWeight: 600 }}>Ver Términos de uso →</Link>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 820, margin: '0 auto', padding: '48px 24px 80px' }}>
        <div style={{ marginBottom: 40 }}>
          <h1 style={{ fontSize: 36, fontWeight: 800, color: '#0f172a', margin: '0 0 10px', letterSpacing: '-1px' }}>Política de privacidad</h1>
          <p style={{ color: '#64748b', fontSize: 14, margin: 0 }}>Última actualización: {LAST_UPDATED}</p>
        </div>

        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: '40px 48px', lineHeight: 1.8, color: '#374151', fontSize: 15 }}>

          <Section title="1. Información que recopilamos">
            <p>Recopilamos la siguiente información cuando utilizas CRM SaaS:</p>
            <ul>
              <li><strong>Datos de cuenta:</strong> nombre, dirección de correo electrónico y contraseña (almacenada con hash bcrypt).</li>
              <li><strong>Datos del workspace:</strong> nombre de la organización, slug y configuración.</li>
              <li><strong>Datos de contactos:</strong> información de tus clientes que introduces en la plataforma (nombre, email, teléfono, etc.).</li>
              <li><strong>Datos de uso:</strong> logs de actividad, preferencias de la interfaz, dirección IP y agente de usuario para seguridad.</li>
              <li><strong>Comunicaciones:</strong> mensajes de WhatsApp, email, Telegram y otros canales que gestiones a través de la plataforma.</li>
            </ul>
          </Section>

          <Section title="2. Cómo utilizamos tu información">
            <p>Utilizamos la información recopilada para:</p>
            <ul>
              <li>Proveer, mantener y mejorar los servicios de CRM SaaS.</li>
              <li>Autenticarte y proteger tu cuenta frente a accesos no autorizados.</li>
              <li>Enviarte notificaciones operativas relevantes (alertas de seguridad, actualizaciones del servicio).</li>
              <li>Procesar pagos y gestionar tu suscripción.</li>
              <li>Cumplir con obligaciones legales y resolver disputas.</li>
            </ul>
            <p>No vendemos, alquilamos ni compartimos tus datos personales con terceros con fines comerciales.</p>
          </Section>

          <Section title="3. Base legal del tratamiento">
            <p>El tratamiento de tus datos se fundamenta en:</p>
            <ul>
              <li><strong>Ejecución de contrato:</strong> necesitamos procesar tus datos para prestar el servicio contratado.</li>
              <li><strong>Consentimiento:</strong> para comunicaciones opcionales de marketing, que puedes revocar en cualquier momento.</li>
              <li><strong>Interés legítimo:</strong> para prevenir fraudes, mejorar la seguridad y analizar el uso del servicio.</li>
              <li><strong>Cumplimiento legal:</strong> cuando la ley nos obliga a conservar o compartir información.</li>
            </ul>
          </Section>

          <Section title="4. Compartición de datos con terceros">
            <p>Podemos compartir datos con proveedores de servicios que nos ayudan a operar la plataforma, siempre bajo acuerdos de confidencialidad:</p>
            <ul>
              <li><strong>Proveedores de infraestructura:</strong> servidores en la nube (AWS, DigitalOcean o similar) donde se almacenan los datos.</li>
              <li><strong>APIs de mensajería:</strong> WhatsApp Business API, Twilio, Telegram Bot API, según los canales que actives.</li>
              <li><strong>Procesadores de pago:</strong> Stripe u otros, para gestionar suscripciones.</li>
              <li><strong>Proveedores de IA:</strong> OpenAI, Anthropic, Google, si utilizas funciones de inteligencia artificial.</li>
            </ul>
            <p>Todos estos proveedores están obligados contractualmente a proteger tus datos y a usarlos únicamente para los fines indicados.</p>
          </Section>

          <Section title="5. Retención de datos">
            <p>Conservamos tus datos mientras tu cuenta esté activa. Tras la cancelación de la cuenta:</p>
            <ul>
              <li>Los datos personales se eliminan o anoniman en un plazo de <strong>90 días</strong>.</li>
              <li>Los datos de facturación se conservan durante el período exigido por la ley fiscal aplicable (generalmente 5-7 años).</li>
              <li>Los logs de seguridad se conservan durante <strong>12 meses</strong>.</li>
            </ul>
          </Section>

          <Section title="6. Seguridad de los datos">
            <p>Implementamos medidas técnicas y organizativas para proteger tus datos:</p>
            <ul>
              <li>Contraseñas almacenadas con hash bcrypt (factor de coste 10).</li>
              <li>Comunicaciones cifradas mediante TLS/HTTPS.</li>
              <li>Aislamiento de datos por tenant mediante identificadores únicos.</li>
              <li>Rate limiting y protección contra ataques de fuerza bruta.</li>
              <li>Acceso a producción restringido y auditado.</li>
            </ul>
          </Section>

          <Section title="7. Tus derechos">
            <p>Dependiendo de tu jurisdicción (RGPD, CCPA, LGPD u otras normativas aplicables), tienes derecho a:</p>
            <ul>
              <li><strong>Acceso:</strong> obtener una copia de los datos que conservamos sobre ti.</li>
              <li><strong>Rectificación:</strong> corregir datos inexactos o incompletos.</li>
              <li><strong>Supresión:</strong> solicitar la eliminación de tus datos ("derecho al olvido").</li>
              <li><strong>Portabilidad:</strong> recibir tus datos en formato estructurado y legible por máquina.</li>
              <li><strong>Oposición:</strong> oponerte al tratamiento basado en interés legítimo.</li>
              <li><strong>Limitación:</strong> solicitar la restricción del tratamiento en ciertos casos.</li>
            </ul>
            <p>Para ejercer cualquiera de estos derechos, contáctanos en <strong>privacidad@crmsaas.com</strong>. Responderemos en un plazo máximo de 30 días.</p>
          </Section>

          <Section title="8. Cookies">
            <p>CRM SaaS utiliza las siguientes categorías de cookies:</p>
            <ul>
              <li><strong>Esenciales:</strong> necesarias para el funcionamiento del servicio (autenticación, sesión). No pueden desactivarse.</li>
              <li><strong>Analíticas:</strong> nos ayudan a entender cómo se utiliza la plataforma. Puedes optar por no participar.</li>
            </ul>
            <p>No utilizamos cookies de publicidad ni de rastreo entre sitios.</p>
          </Section>

          <Section title="9. Menores de edad">
            <p>CRM SaaS no está dirigido a personas menores de 16 años. No recopilamos conscientemente datos de menores. Si detectamos que hemos recibido datos de un menor sin consentimiento parental, los eliminaremos de inmediato.</p>
          </Section>

          <Section title="10. Cambios en esta política">
            <p>Podemos actualizar esta política periódicamente. Te notificaremos por email con al menos <strong>15 días de antelación</strong> ante cambios materiales. El uso continuado del servicio tras esa fecha implica la aceptación de la nueva política.</p>
          </Section>

          <Section title="11. Contacto">
            <p>Para cualquier consulta sobre privacidad o protección de datos:</p>
            <ul>
              <li>Email: <strong>privacidad@crmsaas.com</strong></li>
              <li>Dirección postal: disponible bajo solicitud</li>
            </ul>
            <p>Si consideras que tu reclamación no ha sido resuelta satisfactoriamente, puedes acudir a la autoridad de control de protección de datos de tu país.</p>
          </Section>

        </div>

        <div style={{ marginTop: 32, textAlign: 'center', fontSize: 13, color: '#94a3b8' }}>
          <Link href="/terms" style={{ color: '#6366f1', textDecoration: 'none', fontWeight: 600 }}>Términos de uso</Link>
          {' · '}
          <Link href="/login" style={{ color: '#94a3b8', textDecoration: 'none' }}>Volver al inicio de sesión</Link>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', margin: '0 0 12px', borderBottom: '1px solid #f1f5f9', paddingBottom: 8 }}>{title}</h2>
      {children}
    </div>
  );
}
