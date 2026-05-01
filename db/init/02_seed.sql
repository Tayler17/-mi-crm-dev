-- 02_seed.sql
-- Datos iniciales de demostración

-- Tenant demo
INSERT INTO tenants (id, name, slug, plan, is_active)
VALUES ('00000000-0000-0000-0000-000000000001', 'Demo Company', 'demo', 'pro', TRUE)
ON CONFLICT DO NOTHING;

-- Admin user (password: password123)
-- Hash: $2b$10$1RqVFdmpsiEbVoyF0.minec8i8x1dDxR6zZkg7n3x9d4FY4Rg59Gy
INSERT INTO users (id, tenant_id, email, password_hash, full_name, role, is_active)
VALUES (
    '00000000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000001',
    'admin@demo.com',
    '$2b$10$1RqVFdmpsiEbVoyF0.minec8i8x1dDxR6zZkg7n3x9d4FY4Rg59Gy',
    'Admin Demo',
    'owner',
    TRUE
) ON CONFLICT DO NOTHING;
