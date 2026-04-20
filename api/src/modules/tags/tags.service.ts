import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tag } from './entities/tag.entity';

@Injectable()
export class TagsService {
  constructor(
    @InjectRepository(Tag)
    private readonly repo: Repository<Tag>,
  ) {}

  findAll(tenantId: string) {
    return this.repo.find({ where: { tenantId }, order: { name: 'ASC' } });
  }

  async findOne(id: string, tenantId: string) {
    const tag = await this.repo.findOne({ where: { id, tenantId } });
    if (!tag) throw new NotFoundException('Tag not found');
    return tag;
  }

  create(dto: Partial<Tag>, tenantId: string, userId?: string) {
    return this.repo.save(this.repo.create({ ...dto, tenantId, createdBy: userId }));
  }

  async update(id: string, dto: Partial<Tag>, tenantId: string) {
    const tag = await this.findOne(id, tenantId);
    Object.assign(tag, dto);
    return this.repo.save(tag);
  }

  async remove(id: string, tenantId: string) {
    const tag = await this.findOne(id, tenantId);
    await this.repo.remove(tag);
  }
}
