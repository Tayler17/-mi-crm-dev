import {
  Controller, Post, Get, Patch, Delete,
  Body, Param, Query, UseGuards, Request, HttpCode, ForbiddenException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';
import { CreateTenantDto, UpdateTenantDto, RegisterDto } from './dto/tenant.dto';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard, hasRole } from '../../common/guards/roles.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('demo-token')
  @Throttle({ short: { ttl: 60000, limit: 20 } })
  demoToken() {
    return this.authService.demoLogin();
  }

  @Post('register')
  @HttpCode(201)
  @Throttle({ short: { ttl: 60000, limit: 3 } }) // max 3 registrations/min per IP
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @Throttle({ short: { ttl: 60000, limit: 5 } }) // max 5 login attempts/min
  login(@Body() dto: LoginDto, @TenantId() tenantId: string) {
    return this.authService.login(dto, tenantId);
  }

  @Post('forgot-password')
  @HttpCode(200)
  @Throttle({ short: { ttl: 60000, limit: 3 } }) // max 3 reset requests/min
  forgotPassword(@Body() body: { email: string; workspace: string }) {
    return this.authService.forgotPassword(body.email, body.workspace).then(() => ({
      message: 'Si el email existe recibirás un enlace para restablecer la contraseña.',
    }));
  }

  @Post('reset-password')
  @HttpCode(200)
  @Throttle({ short: { ttl: 60000, limit: 3 } })
  resetPassword(@Body() body: { token: string; password: string }) {
    return this.authService.resetPassword(body.token, body.password).then(() => ({
      message: 'Contraseña actualizada correctamente.',
    }));
  }

  @Get('verify-email')
  @HttpCode(200)
  verifyEmail(@Query('token') token: string) {
    return this.authService.verifyEmail(token).then(() => ({
      message: 'Email verificado correctamente.',
    }));
  }

  // ── Current user availability ─────────────────────────────────────────────

  @Patch('me/availability')
  @UseGuards(JwtAuthGuard)
  setAvailability(@Body('availability') availability: string, @TenantId() tenantId: string, @Request() req: any) {
    return this.authService.setAvailability(req.user.id, tenantId, availability);
  }

  /** Update own profile: name and/or avatar URL */
  @Patch('me')
  @UseGuards(JwtAuthGuard)
  updateMe(
    @Body() body: { fullName?: string; avatarUrl?: string },
    @Request() req: any,
    @TenantId() tenantId: string,
  ) {
    return this.authService.updateMe(req.user.id, tenantId, body);
  }

  // ── Agents (for filters/selects) ─────────────────────────────────────────

  @Get('agents')
  @UseGuards(JwtAuthGuard)
  getAgents(@TenantId() tenantId: string) {
    return this.authService.getAgents(tenantId);
  }

  // ── Users CRUD ────────────────────────────────────────────────────────────

  @Get('users')
  @UseGuards(JwtAuthGuard)
  getUsers(@TenantId() tenantId: string) {
    return this.authService.getUsers(tenantId);
  }

  @Get('users/:id')
  @UseGuards(JwtAuthGuard)
  getUser(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.authService.getUser(id, tenantId);
  }

  @Post('users')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  createUser(@Body() dto: CreateUserDto, @TenantId() tenantId: string, @Request() req: any) {
    // Prevent privilege escalation: cannot assign a role higher than your own
    if (dto.role && !hasRole(req.user.role, dto.role)) {
      throw new ForbiddenException('No puedes asignar un rol superior al tuyo');
    }
    return this.authService.createUser(dto, tenantId);
  }

  @Patch('users/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  updateUser(@Param('id') id: string, @Body() dto: UpdateUserDto, @TenantId() tenantId: string, @Request() req: any) {
    if (dto.role && !hasRole(req.user.role, dto.role)) {
      throw new ForbiddenException('No puedes asignar un rol superior al tuyo');
    }
    return this.authService.updateUser(id, dto, tenantId);
  }

  @Delete('users/:id')
  @UseGuards(JwtAuthGuard)
  deactivateUser(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.authService.deactivateUser(id, tenantId);
  }

  // ── Tenants CRUD (owner only) ─────────────────────────────────────────────

  @Get('tenants')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('owner')
  getTenants() {
    return this.authService.getTenants();
  }

  @Get('tenants/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('owner')
  getTenant(@Param('id') id: string) {
    return this.authService.getTenant(id);
  }

  @Get('tenants/:id/users')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('owner')
  getTenantUsers(@Param('id') id: string) {
    return this.authService.getTenantUsers(id);
  }

  @Post('tenants')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('owner')
  createTenant(@Body() dto: CreateTenantDto) {
    return this.authService.createTenant(dto);
  }

  @Patch('tenants/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('owner')
  updateTenant(@Param('id') id: string, @Body() dto: UpdateTenantDto) {
    return this.authService.updateTenant(id, dto);
  }

  @Delete('tenants/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('owner')
  deleteTenant(@Param('id') id: string) {
    return this.authService.deleteTenant(id);
  }
}
