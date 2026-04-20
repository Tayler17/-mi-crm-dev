import { Injectable, UnauthorizedException, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { User } from './entities/user.entity';
import { LoginDto } from './dto/login.dto';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: LoginDto, tenantId: string) {
    const user = await this.userRepo.findOne({
      where: { email: dto.email, tenantId, isActive: true },
    });
    if (!user) throw new UnauthorizedException('Credenciales incorrectas');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Credenciales incorrectas');

    const payload = { sub: user.id, email: user.email, tenantId, role: user.role };
    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        tenantId: user.tenantId,
      },
    };
  }

  async validateUser(userId: string, tenantId: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { id: userId, tenantId, isActive: true } });
  }

  getAgents(tenantId: string) {
    return this.userRepo.find({
      where: { tenantId, isActive: true },
      select: ['id', 'fullName', 'email', 'role'],
      order: { fullName: 'ASC' },
    });
  }

  // ── Users CRUD ─────────────────────────────────────────────────────────────

  getUsers(tenantId: string) {
    return this.userRepo.find({
      where: { tenantId },
      select: ['id', 'fullName', 'email', 'role', 'isActive', 'createdAt'],
      order: { fullName: 'ASC' },
    });
  }

  async getUser(id: string, tenantId: string) {
    const user = await this.userRepo.findOne({
      where: { id, tenantId },
      select: ['id', 'fullName', 'email', 'role', 'isActive', 'createdAt'],
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return user;
  }

  async createUser(dto: CreateUserDto, tenantId: string) {
    const exists = await this.userRepo.findOne({ where: { email: dto.email, tenantId } });
    if (exists) throw new ConflictException('Ya existe un usuario con ese email en este tenant');
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = this.userRepo.create({
      tenantId,
      email: dto.email,
      fullName: dto.fullName,
      passwordHash,
      role: dto.role ?? 'agent',
      isActive: true,
    });
    const saved = await this.userRepo.save(user);
    const { passwordHash: _, ...result } = saved as any;
    return result;
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
}
