import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CannedResponse } from './entities/canned-response.entity';

@Injectable()
export class CannedResponsesService {
  constructor(
    @InjectRepository(CannedResponse)
    private readonly repo: Repository<CannedResponse>,
  ) {}

  findAll(tenantId: string) {
    return this.repo.find({ where: { tenantId }, order: { title: 'ASC' } });
  }

  async findOne(id: string, tenantId: string) {
    const r = await this.repo.findOne({ where: { id, tenantId } });
    if (!r) throw new NotFoundException('Canned response not found');
    return r;
  }

  create(dto: Partial<CannedResponse>, tenantId: string, userId?: string) {
    return this.repo.save(this.repo.create({ ...dto, tenantId, createdBy: userId }));
  }

  async update(id: string, dto: Partial<CannedResponse>, tenantId: string) {
    const r = await this.findOne(id, tenantId);
    Object.assign(r, dto);
    return this.repo.save(r);
  }

  async remove(id: string, tenantId: string) {
    const r = await this.findOne(id, tenantId);
    await this.repo.remove(r);
  }
}
