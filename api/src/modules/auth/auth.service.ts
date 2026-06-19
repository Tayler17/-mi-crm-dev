import {
  Injectable, UnauthorizedException, ConflictException,
  NotFoundException, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { checkPlanLimit } from '../../common/utils/limits';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import * as nodemailer from 'nodemailer';
import { User } from './entities/user.entity';
import { Tenant } from './entities/tenant.entity';
import { LoginDto } from './dto/login.dto';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';
import { CreateTenantDto, UpdateTenantDto, RegisterDto } from './dto/tenant.dto';
import { OnboardingEmailService } from './onboarding-email.service';
import { PlatformSettingsService } from '../settings/platform-settings.service';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    private readonly jwtService: JwtService,
    @InjectDataSource() private readonly db: DataSource,
    private readonly onboardingEmail: OnboardingEmailService,
    private readonly platformSettings: PlatformSettingsService,
  ) {
    this.ensureResetColumns();
  }

  private async ensureResetColumns() {
    await this.db.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS reset_token VARCHAR(255),
        ADD COLUMN IF NOT EXISTS reset_token_expires_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS email_verification_token VARCHAR(255),
        ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500)
    `).catch(() => {});
    await this.db.query(`
      ALTER TABLE tenants ADD COLUMN IF NOT EXISTS lang VARCHAR(10) DEFAULT 'es'
    `).catch(() => {});
  }

  private async createTransporter(): Promise<{ transport: nodemailer.Transporter; from: string }> {
    // 1) Try platform settings (configurable from UI)
    const smtp = await this.platformSettings.getSMTP().catch(() => null);
    if (smtp?.host && smtp.host !== 'mailhog') {
      return {
        transport: nodemailer.createTransport({
          host:   smtp.host,
          port:   smtp.port,
          secure: smtp.secure,
          auth:   smtp.user ? { user: smtp.user, pass: smtp.password } : undefined,
          tls:    { rejectUnauthorized: false },
        }),
        from: smtp.from || smtp.user || 'noreply@automarkiq.com',
      };
    }
    // 2) Fall back to env var SMTP_HOST
    const smtpHost = process.env.SMTP_HOST || '';
    if (smtpHost && smtpHost !== 'mailhog') {
      return {
        transport: nodemailer.createTransport({
          host:   smtpHost,
          port:   Number(process.env.SMTP_PORT) || 587,
          secure: process.env.SMTP_SECURE === 'true',
          auth:   { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        }),
        from: process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@automarkiq.com',
      };
    }
    // 3) Fall back to first active email connection in DB (tenant-configured SMTP)
    const rows = await this.db.query(
      `SELECT credentials FROM channel_connections
       WHERE channel_type = 'email' AND is_active = true
         AND (credentials->>'host') IS NOT NULL AND (credentials->>'host') != ''
       ORDER BY created_at ASC LIMIT 1`,
    );
    if (rows.length) {
      const c = rows[0].credentials ?? {};
      return {
        transport: nodemailer.createTransport({
          host:   String(c.host).trim(),
          port:   Number(c.port) || 587,
          secure: Number(c.port) === 465,
          auth:   { user: c.user, pass: c.password },
          tls:    { rejectUnauthorized: false },
        }),
        from: `AutoMarkIQ <${c.user}>`,
      };
    }
    // 4) Last resort: no SMTP configured
    return {
      transport: nodemailer.createTransport({ host: 'localhost', port: 25, secure: false }),
      from: 'noreply@automarkiq.com',
    };
  }

  private async sendVerificationEmail(to: string, token: string, fullName: string, frontendUrl: string) {
    const url = `${frontendUrl}/verify-email?token=${token}`;
    const { transport, from } = await this.createTransporter();
    await transport.sendMail({
      from,
      to,
      subject: 'Verifica tu email — AutoMarkIQ',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
          <h2 style="color:#6366f1">¡Bienvenido, ${fullName}!</h2>
          <p>Tu workspace está listo. Solo falta verificar tu dirección de email para completar el registro.</p>
          <a href="${url}" style="display:inline-block;margin:20px 0;padding:12px 28px;background:#6366f1;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">
            Verificar email
          </a>
          <p style="color:#94a3b8;font-size:12px">El enlace es válido por 24 horas.</p>
          <p style="color:#94a3b8;font-size:12px">Si no creaste una cuenta, ignora este email.</p>
          <p style="color:#94a3b8;font-size:12px">O copia este enlace: ${url}</p>
        </div>
      `,
    });
  }

  private async sendResetEmail(to: string, token: string, frontendUrl: string) {
    const url = `${frontendUrl}/reset-password?token=${token}`;
    const { transport, from } = await this.createTransporter();
    await transport.sendMail({
      from,
      to,
      subject: 'Restablecer contraseña — AutoMarkIQ',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
          <h2 style="color:#6366f1">Restablecer contraseña</h2>
          <p>Recibiste este email porque solicitaste restablecer tu contraseña.</p>
          <p>El enlace es válido por <strong>1 hora</strong>.</p>
          <a href="${url}" style="display:inline-block;margin:20px 0;padding:12px 28px;background:#6366f1;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">
            Restablecer contraseña
          </a>
          <p style="color:#94a3b8;font-size:12px">Si no solicitaste este cambio, ignora este email.</p>
          <p style="color:#94a3b8;font-size:12px">O copia este enlace: ${url}</p>
        </div>
      `,
    });
  }

  async forgotPassword(email: string, workspace: string): Promise<void> {
    const tenantId = await this.resolveTenantId(workspace).catch(() => null);
    if (!tenantId) return; // silent — avoid workspace enumeration
    const user = await this.userRepo.findOne({ where: { email: email.trim().toLowerCase(), tenantId, isActive: true } });
    if (!user) return; // silent — avoid email enumeration

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1h
    await this.userRepo.update(user.id, { resetToken: token, resetTokenExpiresAt: expires });

    const rawFrontend = (process.env.FRONTEND_URL || 'http://localhost:3000').split(',')[0].trim();
    const frontend = rawFrontend.includes('localhost') ? 'https://app.automarkiq.com' : rawFrontend;
    await this.sendResetEmail(user.email, token, frontend);
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const user = await this.userRepo.findOne({ where: { resetToken: token } });
    if (!user || !user.resetTokenExpiresAt || user.resetTokenExpiresAt < new Date()) {
      throw new BadRequestException('El enlace es inválido o ha expirado. Solicita uno nuevo.');
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.userRepo.update(user.id, { passwordHash, resetToken: null, resetTokenExpiresAt: null });
  }

  // ── Tenant resolution ─────────────────────────────────────────────────────

  private async resolveTenantId(slugOrUuid: string): Promise<string> {
    // Normalize: trim, lowercase, spaces → dashes so "taylor services" works same as "taylor-services"
    const normalized = slugOrUuid.trim().toLowerCase().replace(/\s+/g, '-');
    const where: any = UUID_RE.test(normalized)
      ? [{ id: normalized }, { slug: normalized }]
      : [{ slug: normalized }];
    const tenant = await this.tenantRepo.findOne({ where });
    if (!tenant) throw new UnauthorizedException('Workspace no encontrado');
    if (!tenant.isActive) throw new UnauthorizedException('Workspace inactivo');
    return tenant.id;
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  async login(dto: LoginDto, tenantSlugOrId: string) {
    const tenantId = await this.resolveTenantId(tenantSlugOrId);
    const email = dto.email.trim().toLowerCase();

    const user = await this.userRepo.findOne({
      where: { email, tenantId, isActive: true },
    });
    if (!user) throw new UnauthorizedException('Credenciales incorrectas');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Credenciales incorrectas');

    const payload = { sub: user.id, email: user.email, tenantId, role: user.role };
    const accessToken = this.jwtService.sign(payload);

    // Record this login as the latest activity
    this.db.query(`UPDATE users SET last_seen_at=NOW() WHERE id=$1`, [user.id]).catch(() => {});

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        tenantId,
        avatarUrl: user.avatarUrl ?? null,
      },
    };
  }

  /** Heartbeat: mark the user as recently active (throttled in-memory to ~1/min). */
  private readonly lastSeenWrites = new Map<string, number>();
  async touchLastSeen(userId: string) {
    const now = Date.now();
    const prev = this.lastSeenWrites.get(userId) ?? 0;
    if (now - prev < 60_000) return { ok: true }; // throttle DB writes
    this.lastSeenWrites.set(userId, now);
    await this.db.query(`UPDATE users SET last_seen_at=NOW() WHERE id=$1`, [userId]).catch(() => {});
    return { ok: true };
  }

  async demoLogin() {
    const tenant = await this.tenantRepo.findOne({ where: { slug: 'demo', isActive: true } });
    if (!tenant) throw new NotFoundException('Demo workspace not available');
    const user = await this.userRepo.findOne({
      where: { tenantId: tenant.id, role: 'admin', isActive: true },
      order: { createdAt: 'ASC' } as any,
    });
    if (!user) throw new NotFoundException('Demo user not found');
    const payload = { sub: user.id, email: user.email, tenantId: tenant.id, role: user.role };
    const accessToken = this.jwtService.sign(payload, { expiresIn: '2h' });
    return {
      accessToken,
      user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role, tenantId: tenant.id },
    };
  }

  async validateUser(userId: string, tenantId: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { id: userId, tenantId, isActive: true } });
  }

  getAgents(tenantId: string) {
    return this.userRepo.find({
      where: { tenantId, isActive: true },
      select: ['id', 'fullName', 'email', 'role', 'availability'],
      order: { fullName: 'ASC' },
    });
  }

  async setAvailability(userId: string, tenantId: string, availability: string) {
    const allowed = ['online', 'away', 'busy', 'offline'];
    if (!allowed.includes(availability)) availability = 'online';
    await this.userRepo.update({ id: userId, tenantId }, { availability } as any);
    return { availability };
  }

  async updateMe(userId: string, tenantId: string, dto: { fullName?: string; avatarUrl?: string }) {
    const update: Record<string, any> = {};
    if (dto.fullName?.trim())        update.fullName  = dto.fullName.trim();
    if (dto.avatarUrl !== undefined)  update.avatarUrl = dto.avatarUrl ?? null;
    if (Object.keys(update).length)  await this.userRepo.update({ id: userId, tenantId }, update);
    return this.userRepo.findOne({
      where: { id: userId, tenantId },
      select: ['id', 'fullName', 'email', 'role', 'avatarUrl'] as any,
    });
  }

  // ── Users CRUD ────────────────────────────────────────────────────────────

  getUsers(tenantId: string) {
    return this.userRepo.find({
      where: { tenantId },
      select: ['id', 'fullName', 'email', 'role', 'isActive', 'createdAt', 'availability', 'lastSeenAt'],
      order: { fullName: 'ASC' },
    });
  }

  async getUser(id: string, tenantId: string) {
    const user = await this.userRepo.findOne({
      where: { id, tenantId },
      select: ['id', 'fullName', 'email', 'role', 'isActive', 'createdAt', 'availability', 'lastSeenAt'],
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return user;
  }

  async createUser(dto: CreateUserDto, tenantId: string) {
    if (!tenantId) throw new BadRequestException('Tenant ID no encontrado. Vuelve a iniciar sesión.');
    try {
      await checkPlanLimit(this.db, tenantId, 'users');
      const email = dto.email.trim().toLowerCase();
      // Use raw query with explicit ::uuid cast to avoid TypeORM varchar=uuid type mismatch
      const [exists] = await this.db.query(
        'SELECT id FROM users WHERE email=$1 AND tenant_id=$2::uuid LIMIT 1',
        [email, tenantId],
      );
      if (exists) throw new ConflictException('Ya existe un usuario con ese email en este tenant');
      const passwordHash = await bcrypt.hash(dto.password, 10);
      const user = this.userRepo.create({
        tenantId,
        email,
        fullName: dto.fullName,
        passwordHash,
        role: dto.role ?? 'agent',
        isActive: true,
        availability: 'online',
      });
      const saved = await this.userRepo.save(user);
      const { passwordHash: _, ...result } = saved as any;
      return result;
    } catch (e: any) {
      // Re-throw HttpExceptions as-is (ForbiddenException from plan limit, ConflictException, etc.)
      if (e?.status) throw e;
      // Convert raw DB/unexpected errors to readable messages
      const msg: string = e?.message ?? String(e);
      if (msg.includes('unique') || msg.includes('duplicate') || msg.includes('already exists')) {
        throw new ConflictException('Ya existe un usuario con ese email.');
      }
      if (msg.includes('violates not-null') || msg.includes('null value')) {
        throw new BadRequestException(`Error de columna requerida: ${msg}`);
      }
      if (msg.includes('invalid input syntax for type uuid')) {
        throw new BadRequestException('ID de tenant inválido. Cierra sesión y vuelve a entrar.');
      }
      throw new BadRequestException(`No se pudo crear el usuario: ${msg}`);
    }
  }

  async updateUser(id: string, dto: UpdateUserDto, tenantId: string) {
    const user = await this.userRepo.findOne({ where: { id, tenantId } });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    if (dto.fullName !== undefined) user.fullName = dto.fullName;
    if (dto.role !== undefined) user.role = dto.role;
    if (dto.isActive !== undefined) user.isActive = dto.isActive;
    if (dto.password) user.passwordHash = await bcrypt.hash(dto.password, 10);
    const saved = await this.userRepo.save(user);
    const { passwordHash: _, ...result } = saved as any;
    return result;
  }

  async deactivateUser(id: string, tenantId: string) {
    const user = await this.userRepo.findOne({ where: { id, tenantId } });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    user.isActive = false;
    await this.userRepo.save(user);
  }

  // ── Public self-registration ──────────────────────────────────────────────

  async register(dto: RegisterDto) {
    const slugExists = await this.tenantRepo.findOne({ where: { slug: dto.slug } });
    if (slugExists) throw new ConflictException('Ya existe un workspace con ese slug. Elige otro nombre.');

    const VALID_LANGS = ['es', 'en', 'pt', 'tr', 'ar'];
    const lang = VALID_LANGS.includes(dto.lang ?? '') ? dto.lang! : 'es';
    const tenant = this.tenantRepo.create({
      name: dto.workspaceName,
      slug: dto.slug,
      plan: 'free',
      isActive: true,
    });
    const savedTenant = await this.tenantRepo.save(tenant);
    await this.db.query(`UPDATE tenants SET lang=$1 WHERE id=$2`, [lang, savedTenant.id]).catch(() => {});

    // Assign the free plan so checkPlanLimit enforces limits from day 1
    const [freePlan] = await this.db.query(`SELECT id FROM plans WHERE slug = 'free' LIMIT 1`);
    if (freePlan?.id) {
      await this.db.query(`UPDATE tenants SET plan_id = $1 WHERE id = $2`, [freePlan.id, savedTenant.id]);
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const user = this.userRepo.create({
      tenantId: savedTenant.id,
      email: dto.email.trim().toLowerCase(),
      fullName: dto.fullName,
      passwordHash,
      role: 'admin',
      isActive: true,
      emailVerificationToken: verificationToken,
    });
    const savedUser = await this.userRepo.save(user);

    // Send verification email fire-and-forget — don't block registration on SMTP errors
    const rawFrontend = (process.env.FRONTEND_URL || 'http://localhost:3000').split(',')[0].trim();
    const frontend = rawFrontend.includes('localhost') ? 'https://app.automarkiq.com' : rawFrontend;
    this.sendVerificationEmail(savedUser.email, verificationToken, savedUser.fullName, frontend)
      .catch((err) => console.error('Error sending verification email:', err?.message));

    // Onboarding sequence — fire-and-forget
    this.onboardingEmail
      .sendWelcome(savedTenant.id, savedUser.email, savedUser.fullName, savedTenant.name, lang)
      .catch(() => {});

    const payload = { sub: savedUser.id, email: savedUser.email, tenantId: savedTenant.id, role: 'admin' };
    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      emailVerified: false,
      user: {
        id: savedUser.id,
        email: savedUser.email,
        fullName: savedUser.fullName,
        role: 'admin',
        tenantId: savedTenant.id,
      },
    };
  }

  async verifyEmail(token: string): Promise<void> {
    const user = await this.userRepo.findOne({ where: { emailVerificationToken: token } });
    if (!user) throw new BadRequestException('El enlace de verificación es inválido o ya fue usado.');
    if (user.emailVerifiedAt) return; // already verified — idempotent
    await this.userRepo.update(user.id, {
      emailVerifiedAt: new Date(),
      emailVerificationToken: null,
    });
  }

  // ── Tenants CRUD (super-admin) ─────────────────────────────────────────────

  async getTenants() {
    const rows = await this.db.query(`
      SELECT
        t.id, t.name, t.slug, t.plan, t.is_active AS "isActive",
        t.plan_id AS "planId",
        t.plan_expires_at AS "planExpiresAt",
        t.trial_ends_at AS "trialEndsAt",
        t.billing_email AS "billingEmail",
        t.billing_notes AS "billingNotes",
        t.stripe_subscription_status AS "stripeSubscriptionStatus",
        t.created_at AS "createdAt",
        p.name AS "planName", p.color AS "planColor", p.slug AS "planSlug",
        p.price AS "planPrice", p.currency AS "planCurrency",
        p.billing_period AS "planBillingPeriod",
        COUNT(DISTINCT u.id)::int AS "userCount",
        COUNT(DISTINCT c.id)::int AS "contactCount",
        (SELECT COUNT(*)::int FROM messages m JOIN conversations cv ON cv.id = m.conversation_id
         WHERE cv.tenant_id = t.id AND m.sender_type = 'bot'
           AND m.created_at >= date_trunc('month', NOW())) AS "aiMessagesMonth",
        (SELECT COALESCE(SUM(cl.duration),0)::int FROM call_logs cl
         WHERE cl.tenant_id::text = t.id::text
           AND cl.created_at >= date_trunc('month', NOW())) AS "callSecondsMonth"
      FROM tenants t
      LEFT JOIN plans p ON p.id = t.plan_id
      LEFT JOIN users u ON u.tenant_id = t.id
      LEFT JOIN contacts c ON c.tenant_id = t.id
      GROUP BY t.id, p.id
      ORDER BY t.created_at DESC
    `);
    return rows;
  }

  async getTenantUsers(tenantId: string) {
    return this.db.query(
      `SELECT id, full_name AS "fullName", email, role, is_active AS "isActive",
              availability, created_at AS "createdAt"
       FROM users WHERE tenant_id = $1 ORDER BY role, full_name`,
      [tenantId],
    );
  }

  async getTenant(id: string) {
    const tenant = await this.tenantRepo.findOne({ where: { id } });
    if (!tenant) throw new NotFoundException('Tenant no encontrado');
    return tenant;
  }

  async createTenant(dto: CreateTenantDto) {
    const slugExists = await this.tenantRepo.findOne({ where: { slug: dto.slug } });
    if (slugExists) throw new ConflictException('Ya existe un workspace con ese slug');

    const tenant = this.tenantRepo.create({
      name: dto.name,
      slug: dto.slug,
      plan: dto.plan ?? 'free',
      isActive: true,
    });
    const savedTenant = await this.tenantRepo.save(tenant);

    const passwordHash = await bcrypt.hash(dto.adminPassword, 10);
    const adminUser = this.userRepo.create({
      tenantId: savedTenant.id,
      email: dto.adminEmail,
      fullName: dto.adminName ?? 'Admin',
      passwordHash,
      role: 'admin',
      isActive: true,
    });
    await this.userRepo.save(adminUser);

    return savedTenant;
  }

  async deleteTenant(id: string) {
    // Delete all tenant data in dependency order
    await this.db.query(`DELETE FROM messages WHERE tenant_id = $1`, [id]);
    await this.db.query(`DELETE FROM conversations WHERE tenant_id = $1`, [id]);
    await this.db.query(`DELETE FROM contacts WHERE tenant_id = $1`, [id]);
    await this.db.query(`DELETE FROM channel_connections WHERE tenant_id = $1`, [id]);
    await this.db.query(`DELETE FROM inboxes WHERE tenant_id = $1`, [id]);
    await this.db.query(`DELETE FROM users WHERE tenant_id = $1`, [id]);
    await this.db.query(`DELETE FROM tenants WHERE id = $1`, [id]);
    return { ok: true };
  }

  async updateTenant(id: string, dto: UpdateTenantDto) {
    const sets: string[] = ['updated_at = NOW()'];
    const params: any[] = [id];
    let i = 2;
    if (dto.name       !== undefined) { sets.push(`name = $${i++}`);           params.push(dto.name); }
    if (dto.plan       !== undefined) { sets.push(`plan = $${i++}`);           params.push(dto.plan); }
    if (dto.isActive   !== undefined) { sets.push(`is_active = $${i++}`);      params.push(dto.isActive); }
    if (dto.planId     !== undefined) { sets.push(`plan_id = $${i++}`);        params.push(dto.planId || null); }
    if (dto.billingEmail  !== undefined) { sets.push(`billing_email = $${i++}`);   params.push(dto.billingEmail); }
    if (dto.billingNotes  !== undefined) { sets.push(`billing_notes = $${i++}`);   params.push(dto.billingNotes); }
    if (dto.planExpiresAt !== undefined) { sets.push(`plan_expires_at = $${i++}`); params.push(dto.planExpiresAt || null); }
    await this.db.query(`UPDATE tenants SET ${sets.join(', ')} WHERE id = $1`, params);
    return { ok: true };
  }
}
