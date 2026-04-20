import { Controller, Post, Get, Patch, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() dto: LoginDto, @TenantId() tenantId: string) {
    return this.authService.login(dto, tenantId);
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
  @UseGuards(JwtAuthGuard)
  createUser(@Body() dto: CreateUserDto, @TenantId() tenantId: string) {
    return this.authService.createUser(dto, tenantId);
  }

  @Patch('users/:id')
  @UseGuards(JwtAuthGuard)
  updateUser(@Param('id') id: string, @Body() dto: UpdateUserDto, @TenantId() tenantId: string) {
    return this.authService.updateUser(id, dto, tenantId);
  }

  @Delete('users/:id')
  @UseGuards(JwtAuthGuard)
  deactivateUser(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.authService.deactivateUser(id, tenantId);
  }
}
