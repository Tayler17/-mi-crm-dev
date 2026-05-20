import Link from 'next/link';

export const metadata = { title: 'Términos de uso — AutoMarkIQ' };

const LAST_UPDATED = '24 de abril de 2026';

export default function TermsPage() {
  return (
    <div style={{ fontFamily: 'Inter, system-ui, sans-serif', minHeight: '100vh', background: '#f8fafc' }}>

      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '16px 0' }}>
        <div style={{ maxWidth: 820, margin: '0 auto', padding: '0 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Link href="/" style={{ fontWeight: 800, fontSize: 20, letterSpacing: '-0.5px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', textDecoration: 'none' }}>AutoMarkIQ</Link>
          <Link href="/privacy" style={{ fontSize: 13, color: '#6366f1', textDecoration: 'none', fontWeight: 600 }}>Ver Política de privacidad →</Link>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 820, margin: '0 auto', padding: '48px 24px 80px' }}>
        <div style={{ marginBottom: 40 }}>
          <h1 style={{ fontSize: 36, fontWeight: 800, color: '#0f172a', margin: '0 0 10px', letterSpacing: '-1px' }}>Términos de uso</h1>
          <p style={{ color: '#64748b', fontSize: 14, margin: 0 }}>Última actualización: {LAST_UPDATED}</p>
        </div>

        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: '40px 48px', lineHeight: 1.8, color: '#374151', fontSize: 15 }}>

          <Section title="1. Aceptación de los términos">
            <p>Al crear una cuenta o utilizar AutoMarkIQ (el "Servicio"), aceptas quedar vinculado por estos Términos de uso. Si no estás de acuerdo con alguno de estos términos, no podrás utilizar el Servicio.</p>
            <p>Estos términos constituyen un acuerdo legalmente vinculante entre tú (el "Usuario") y AutoMarkIQ (el "Proveedor"). Si actúas en nombre de una empresa, declaras tener autoridad para comprometer a dicha organización.</p>
          </Section>

          <Section title="2. Descripción del servicio">
            <p>AutoMarkIQ es una plataforma de gestión de relaciones con clientes (CRM) que ofrece, entre otras funcionalidades:</p>
            <ul>
              <li>Gestión de contactos, deals y pipelines de ventas.</li>
              <li>Bandeja de entrada unificada para canales de comunicación (WhatsApp, email, Telegram, etc.).</li>
              <li>Automatizaciones y flujos de conversación.</li>
              <li>Funciones de inteligencia artificial para chatbots y análisis.</li>
              <li>Gestión de equipos, tareas y campañas.</li>
            </ul>
            <p>El Proveedor se reserva el derecho de modificar, suspender o descontinuar cualquier aspecto del Servicio con aviso previo de <strong>30 días</strong>, excepto en casos de emergencia de seguridad.</p>
          </Section>

          <Section title="3. Registro y cuenta">
            <p>Para utilizar el Servicio debes:</p>
            <ul>
              <li>Ser mayor de 16 años (o contar con consentimiento parental documentado).</li>
              <li>Proporcionar información veraz, completa y actualizada durante el registro.</li>
              <li>Mantener la confidencialidad de tus credenciales de acceso.</li>
              <li>Notificar inmediatamente cualquier uso no autorizado de tu cuenta.</li>
            </ul>
            <p>Eres responsable de toda la actividad que ocurra bajo tu cuenta. El Proveedor no será responsable de pérdidas derivadas del uso no autorizado de tu cuenta si no has tomado medidas razonables de seguridad.</p>
          </Section>

          <Section title="4. Planes y pagos">
            <ul>
              <li><strong>Plan gratuito:</strong> incluye funcionalidades básicas sin coste, sujeto a límites de uso publicados.</li>
              <li><strong>Planes de pago:</strong> con facturación mensual o anual. Los precios se indican en la página de planes y pueden cambiar con aviso de 30 días.</li>
              <li><strong>Prueba gratuita:</strong> si se ofrece, no requiere tarjeta de crédito y se convierte en plan gratuito al finalizar, salvo que el usuario seleccione un plan de pago.</li>
              <li><strong>Política de reembolso:</strong> los cargos ya facturados no son reembolsables, excepto cuando la ley aplicable lo exija. Si cancelas antes del próximo ciclo de facturación, mantendrás el acceso hasta el final del período pagado.</li>
            </ul>
          </Section>

          <Section title="5. Uso aceptable">
            <p>Te comprometes a utilizar el Servicio únicamente para fines legales y conforme a estos términos. Está expresamente prohibido:</p>
            <ul>
              <li>Usar el Servicio para enviar spam, comunicaciones no solicitadas o mensajes fraudulentos.</li>
              <li>Violar las políticas de uso aceptable de las plataformas de mensajería integradas (WhatsApp, Telegram, etc.).</li>
              <li>Intentar acceder sin autorización a sistemas o datos de otros usuarios.</li>
              <li>Realizar ingeniería inversa, descompilar o intentar extraer el código fuente del Servicio.</li>
              <li>Usar el Servicio para actividades ilegales, incluida la recopilación de datos personales sin base legal.</li>
              <li>Sobrecargar la infraestructura del Servicio mediante el uso abusivo de la API o solicitudes automatizadas masivas.</li>
            </ul>
            <p>El incumplimiento puede resultar en la suspensión o cancelación inmediata de la cuenta.</p>
          </Section>

          <Section title="6. Propiedad de los datos">
            <p><strong>Tus datos son tuyos.</strong> Conservas toda la propiedad sobre los datos que introduces en el Servicio (contactos, conversaciones, etc.). El Proveedor no vende ni monetiza estos datos.</p>
            <p>Concedes al Proveedor una licencia limitada, no exclusiva y libre de regalías para procesar y almacenar tus datos exclusivamente con el fin de prestar el Servicio.</p>
            <p>Puedes exportar tus datos en cualquier momento desde la plataforma. Tras la cancelación de la cuenta, podrás solicitar una exportación completa dentro de los 30 días posteriores.</p>
          </Section>

          <Section title="7. Propiedad intelectual">
            <p>El Servicio, incluyendo su software, diseño, logotipos y documentación, es propiedad exclusiva del Proveedor y está protegido por leyes de propiedad intelectual. No se concede ninguna licencia sobre la propiedad intelectual del Proveedor más allá del derecho a usar el Servicio según estos términos.</p>
          </Section>

          <Section title="8. Limitación de responsabilidad">
            <p>En la máxima medida permitida por la ley aplicable:</p>
            <ul>
              <li>El Servicio se proporciona "tal cual" y "según disponibilidad", sin garantías expresas ni implícitas.</li>
              <li>El Proveedor no garantiza que el Servicio sea ininterrumpido, seguro o libre de errores.</li>
              <li>La responsabilidad total del Proveedor frente al Usuario no superará el importe pagado por el Servicio en los 12 meses anteriores al evento que originó la reclamación.</li>
              <li>El Proveedor no será responsable de daños indirectos, incidentales, especiales o consecuentes.</li>
            </ul>
          </Section>

          <Section title="9. Indemnización">
            <p>Aceptas indemnizar y mantener indemne al Proveedor frente a reclamaciones, daños, obligaciones, pérdidas, costes y gastos (incluidos honorarios de abogados) derivados de: (i) tu uso del Servicio; (ii) tu incumplimiento de estos Términos; (iii) tu infracción de derechos de terceros.</p>
          </Section>

          <Section title="10. Terminación">
            <p>Puedes cancelar tu cuenta en cualquier momento desde la configuración del workspace. El Proveedor puede suspender o cancelar tu acceso si:</p>
            <ul>
              <li>Incumples estos Términos de forma material.</li>
              <li>No pagas las facturas pendientes.</li>
              <li>El Servicio es discontinuado (con aviso previo de 30 días).</li>
            </ul>
            <p>Tras la terminación, el acceso al Servicio cesará inmediatamente. Los datos se conservarán 90 días para posible recuperación, tras los cuales serán eliminados de forma permanente.</p>
          </Section>

          <Section title="11. Legislación aplicable">
            <p>Estos Términos se rigen por la legislación española y de la Unión Europea. Las partes se someten a la jurisdicción exclusiva de los tribunales competentes del domicilio del Proveedor para resolver cualquier disputa derivada de estos Términos, sin perjuicio de los derechos que como consumidor puedas tener en tu país de residencia.</p>
          </Section>

          <Section title="12. Modificaciones">
            <p>Podemos actualizar estos Términos en cualquier momento. Notificaremos los cambios materiales por email con al menos <strong>15 días de antelación</strong>. El uso continuado del Servicio tras dicha fecha implica la aceptación de los Términos actualizados.</p>
          </Section>

          <Section title="13. Contacto">
            <p>Para cualquier consulta sobre estos Términos:</p>
            <ul>
              <li>Email: <strong>legal@crmsaas.com</strong></li>
              <li>Dirección postal: disponible bajo solicitud</li>
            </ul>
          </Section>

        </div>

        <div style={{ marginTop: 32, textAlign: 'center', fontSize: 13, color: '#94a3b8' }}>
          <Link href="/privacy" style={{ color: '#6366f1', textDecoration: 'none', fontWeight: 600 }}>Política de privacidad</Link>
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
