#!/bin/bash
# AutoMarkIQ — Demo workspace seed
# Usage: bash /opt/crm/scripts/demo-seed.sh
set -e
cd /opt/crm

echo "==> Generating bcrypt hash for demo password (demo1234)..."
DEMO_HASH=$(docker exec crm_api sh -c "node -e \"require('bcrypt').hash('demo1234',10).then(h=>{process.stdout.write(h);process.exit(0)})\"" 2>/dev/null)

if [ -z "$DEMO_HASH" ]; then
  echo "ERROR: Could not generate hash. Is crm_api running?"
  exit 1
fi
echo "    Hash OK."

# Write SQL template to temp file (single-quoted heredoc = no shell expansion)
cat > /tmp/demo-seed-tpl.sql << 'SQLEOF'
DO $$
DECLARE
  pw       TEXT := 'DEMO_HASH_PLACEHOLDER';
  t_id     UUID; u_admin UUID; u_agent1 UUID; u_agent2 UUID;
  inbox_id UUID; pipe_id UUID;
  s1 UUID; s2 UUID; s3 UUID; s4 UUID;
  c1 UUID; c2 UUID; c3 UUID; c4 UUID; c5 UUID; c6 UUID;
  v1 UUID; v2 UUID; v3 UUID; v4 UUID; v5 UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM tenants WHERE slug = 'demo') THEN
    RAISE NOTICE 'Demo workspace already exists. Skipping.';
    RETURN;
  END IF;

  -- Tenant
  INSERT INTO tenants (name, slug, plan, is_active)
    VALUES ('Demo Company', 'demo', 'pro', true) RETURNING id INTO t_id;

  -- Users
  INSERT INTO users (tenant_id, email, password_hash, full_name, role, is_active)
    VALUES (t_id, 'admin@demo.local', pw, 'Admin Demo', 'admin', true) RETURNING id INTO u_admin;
  INSERT INTO users (tenant_id, email, password_hash, full_name, role, is_active)
    VALUES (t_id, 'carlos@demo.local', pw, 'Carlos López', 'agent', true) RETURNING id INTO u_agent1;
  INSERT INTO users (tenant_id, email, password_hash, full_name, role, is_active)
    VALUES (t_id, 'maria@demo.local', pw, 'María García', 'agent', true) RETURNING id INTO u_agent2;

  -- Inbox
  INSERT INTO inboxes (tenant_id, name, channel_type, is_enabled)
    VALUES (t_id, 'Demo Webchat', 'webchat', true) RETURNING id INTO inbox_id;

  -- Pipeline + stages
  INSERT INTO pipelines (tenant_id, name, is_default)
    VALUES (t_id, 'Pipeline de Ventas', true) RETURNING id INTO pipe_id;
  INSERT INTO pipeline_stages (tenant_id, pipeline_id, name, "position") VALUES (t_id, pipe_id, 'Prospecto',  0) RETURNING id INTO s1;
  INSERT INTO pipeline_stages (tenant_id, pipeline_id, name, "position") VALUES (t_id, pipe_id, 'Propuesta',  1) RETURNING id INTO s2;
  INSERT INTO pipeline_stages (tenant_id, pipeline_id, name, "position") VALUES (t_id, pipe_id, 'Negociación',2) RETURNING id INTO s3;
  INSERT INTO pipeline_stages (tenant_id, pipeline_id, name, "position") VALUES (t_id, pipe_id, 'Cerrado',    3) RETURNING id INTO s4;

  -- Contacts
  INSERT INTO contacts (tenant_id, full_name, email, phone, job_title) VALUES (t_id, 'Andrés Martínez', 'andres@restaurante-madrid.es', '+34 611 234 567', 'Gerente') RETURNING id INTO c1;
  INSERT INTO contacts (tenant_id, full_name, email, phone, job_title) VALUES (t_id, 'Sofia Chen',       'sofia@techsolutions.co',        '+44 7911 234567',  'CEO') RETURNING id INTO c2;
  INSERT INTO contacts (tenant_id, full_name, email, phone, job_title) VALUES (t_id, 'Omar Khalil',      'omar@clinica-norte.com',        '+34 622 345 678',  'Director médico') RETURNING id INTO c3;
  INSERT INTO contacts (tenant_id, full_name, email, phone, job_title) VALUES (t_id, 'Priya Sharma',     'priya@fashionstore.in',         '+91 9876543210',   'Fundadora') RETURNING id INTO c4;
  INSERT INTO contacts (tenant_id, full_name, email, phone, job_title) VALUES (t_id, 'Lucas Ferreira',   'lucas@logistica-br.com',        '+55 11 98765-4321','Jefe de operaciones') RETURNING id INTO c5;
  INSERT INTO contacts (tenant_id, full_name, email, phone, job_title) VALUES (t_id, 'Emma Wilson',      'emma@digitalagency.co.uk',      '+44 7700 900123',  'Marketing Manager') RETURNING id INTO c6;
  INSERT INTO contacts (tenant_id, full_name, email, phone, job_title) VALUES
    (t_id, 'Diego Rojas',       'diego@inmobiliaria.mx',    '+52 55 1234 5678',  'Agente inmobiliario'),
    (t_id, 'Fatima Al-Hassan',  'fatima@ecommerce-ae.com',  '+971 50 123 4567',  'E-commerce Director');

  -- Conversations
  INSERT INTO conversations (tenant_id, inbox_id, contact_id, subject, status, channel_type, assigned_to) VALUES (t_id, inbox_id, c1, 'Consulta sobre plan Pro',             'open',     'webchat', u_agent1) RETURNING id INTO v1;
  INSERT INTO conversations (tenant_id, inbox_id, contact_id, subject, status, channel_type, assigned_to) VALUES (t_id, inbox_id, c2, 'Integración WhatsApp Business',        'open',     'webchat', u_agent2) RETURNING id INTO v2;
  INSERT INTO conversations (tenant_id, inbox_id, contact_id, subject, status, channel_type, assigned_to) VALUES (t_id, inbox_id, c3, 'Demo personalizada solicitada',        'pending',  'webchat', u_agent1) RETURNING id INTO v3;
  INSERT INTO conversations (tenant_id, inbox_id, contact_id, subject, status, channel_type, assigned_to) VALUES (t_id, inbox_id, c4, 'Precio para equipo de 15 personas',    'open',     'webchat', u_agent2) RETURNING id INTO v4;
  INSERT INTO conversations (tenant_id, inbox_id, contact_id, subject, status, channel_type, assigned_to) VALUES (t_id, inbox_id, c5, 'Soporte email — resuelto',             'resolved', 'webchat', u_agent1) RETURNING id INTO v5;

  -- Messages
  INSERT INTO messages (tenant_id, conversation_id, sender_type, body, direction, status, created_at) VALUES
    (t_id, v1, 'contact', 'Hola, quería saber más sobre el plan Pro. ¿Qué incluye exactamente?',                                                       'inbound',  'read', NOW() - INTERVAL '2 hours'),
    (t_id, v1, 'agent',   'Hola Andrés, el plan Pro incluye 10 agentes, 5.000 contactos, chatbots IA y 200 min de llamadas al mes. ¿Alguna pregunta?', 'outbound', 'read', NOW() - INTERVAL '1 hour 50 min'),
    (t_id, v1, 'contact', '¿Se puede conectar WhatsApp Business?',                                                                                      'inbound',  'read', NOW() - INTERVAL '1 hour 30 min'),
    (t_id, v1, 'agent',   'Sí, WhatsApp Business API está disponible en el plan Pro. Te envío los pasos de configuración.',                              'outbound', 'sent', NOW() - INTERVAL '1 hour');

  INSERT INTO messages (tenant_id, conversation_id, sender_type, body, direction, status, created_at) VALUES
    (t_id, v2, 'contact', 'Buenos días. Quiero integrar WhatsApp Business con mi equipo de soporte.',                                                    'inbound',  'read', NOW() - INTERVAL '3 hours'),
    (t_id, v2, 'agent',   'Buenos días Sofia. ¿Tienes WhatsApp Business API o la versión estándar?',                                                    'outbound', 'read', NOW() - INTERVAL '2 hours 50 min'),
    (t_id, v2, 'contact', 'Tenemos la API. ¿Necesitamos número verificado en Meta?',                                                                    'inbound',  'read', NOW() - INTERVAL '2 hours'),
    (t_id, v2, 'agent',   'Sí, necesitas un número verificado en Meta Business Suite. Puedo guiarte paso a paso.',                                      'outbound', 'sent', NOW() - INTERVAL '1 hour 30 min');

  INSERT INTO messages (tenant_id, conversation_id, sender_type, body, direction, status, created_at) VALUES
    (t_id, v3, 'contact', 'Nos interesa el sistema para la clínica pero necesitamos una demo personalizada.',                                             'inbound',  'read', NOW() - INTERVAL '5 hours'),
    (t_id, v3, 'agent',   'Perfecto Omar. Tengo disponibilidad mañana de 10h a 13h. ¿Te viene bien?',                                                   'outbound', 'sent', NOW() - INTERVAL '4 hours');

  INSERT INTO messages (tenant_id, conversation_id, sender_type, body, direction, status, created_at) VALUES
    (t_id, v4, 'contact', 'Somos un equipo de 15 personas. ¿Cuánto costaría?',                                                                          'inbound',  'read', NOW() - INTERVAL '1 day'),
    (t_id, v4, 'agent',   'Hola Priya. Para 15 personas te recomendaría el plan Business ($149/mes) con usuarios ilimitados. ¿Preparo una propuesta?',  'outbound', 'sent', NOW() - INTERVAL '23 hours');

  INSERT INTO messages (tenant_id, conversation_id, sender_type, body, direction, status, created_at) VALUES
    (t_id, v5, 'contact', 'Tengo un problema conectando el email con Gmail.',                                                                            'inbound',  'read', NOW() - INTERVAL '2 days'),
    (t_id, v5, 'agent',   'Para Gmail activa IMAP y usa una contraseña de aplicación (no la contraseña normal). ¿Lo tienes?',                           'outbound', 'read', NOW() - INTERVAL '1 day 22 hours'),
    (t_id, v5, 'contact', 'Lo acabo de activar y ya funciona. ¡Gracias!',                                                                               'inbound',  'read', NOW() - INTERVAL '1 day 20 hours'),
    (t_id, v5, 'agent',   'Perfecto Lucas. Cualquier duda, aquí estamos.',                                                                               'outbound', 'read', NOW() - INTERVAL '1 day 19 hours');

  -- Deals
  INSERT INTO deals (tenant_id, contact_id, stage_id, title, value, currency, priority, status, assigned_to) VALUES
    (t_id, c1, s2, 'Restaurante Madrid — Plan Pro anual',    2400.00, 'USD', 'high',   'open', u_agent1),
    (t_id, c2, s3, 'TechSolutions — Plan Business',          7200.00, 'USD', 'high',   'open', u_agent2),
    (t_id, c3, s1, 'Clínica Norte — Demo y evaluación',      3600.00, 'USD', 'medium', 'open', u_agent1),
    (t_id, c4, s2, 'Fashion Store — 15 usuarios',            4800.00, 'USD', 'medium', 'open', u_agent2),
    (t_id, c5, s4, 'Logística BR — Plan Pro firmado',        1800.00, 'USD', 'low',    'open', u_agent1),
    (t_id, c6, s1, 'Digital Agency UK — Evaluación inicial', 2400.00, 'USD', 'low',    'open', u_agent2);

  -- Tasks
  INSERT INTO tasks (tenant_id, title, description, due_date, status, priority, contact_id, assigned_to) VALUES
    (t_id, 'Enviar propuesta a Sofia Chen',    'Plan Business para equipo de 8 personas',           NOW() + INTERVAL '1 day',  'pending', 'high',   c2, u_agent2),
    (t_id, 'Demo clínica con Omar Khalil',     'Video llamada — caso de uso clínica dental',        NOW() + INTERVAL '2 days', 'pending', 'high',   c3, u_agent1),
    (t_id, 'Follow up — Fashion Store',        'Confirmar número de usuarios finales con Priya',   NOW() + INTERVAL '3 days', 'pending', 'medium', c4, u_agent2),
    (t_id, 'Onboarding Andrés Martínez',       'Primera bandeja y conexión WhatsApp',              NOW(),                     'pending', 'high',   c1, u_agent1),
    (t_id, 'Renovación contrato Lucas',        'Oferta anual con 15% descuento',                   NOW() + INTERVAL '7 days', 'pending', 'low',    c5, u_agent1);

  RAISE NOTICE 'Demo workspace seeded. Tenant ID: %', t_id;
END;
$$;
SQLEOF

# Replace placeholder with actual hash (Python handles $ signs safely)
echo "==> Preparing SQL..."
python3 -c "
import sys
sql = open('/tmp/demo-seed-tpl.sql').read()
sql = sql.replace('DEMO_HASH_PLACEHOLDER', sys.argv[1])
open('/tmp/demo-seed.sql', 'w').write(sql)
" "$DEMO_HASH"

echo "==> Running seed..."
docker exec -i crm_postgres sh -c 'psql -U $POSTGRES_USER -d $POSTGRES_DB' < /tmp/demo-seed.sql

echo ""
echo "==> Done! Demo workspace ready at:"
echo "    https://app.automarkiq.com/demo"
