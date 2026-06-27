import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, Request, Res, ForbiddenException } from '@nestjs/common';
import { Response } from 'express';
import { VoicesService } from './voices.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('voices')
@UseGuards(JwtAuthGuard)
export class VoicesController {
  constructor(private readonly svc: VoicesService) {}

  /** All authenticated users can list voices (tenants need this for the bot form) */
  @Get()
  findAll() {
    return this.svc.findAll();
  }

  /** Audio sample of a voice (owner + tenants). Cached per voice → minimal Deepgram cost. */
  @Get(':id/preview')
  async preview(@Param('id') id: string, @Res() res: Response) {
    const { buffer, contentType } = await this.svc.getPreviewAudio(id);
    res.set({ 'Content-Type': contentType, 'Cache-Control': 'private, max-age=86400' });
    res.send(buffer);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  /** Only owner can create/update/delete voices */
  @Post()
  create(@Body() body: any, @Request() req: any) {
    if (req.user?.role !== 'owner') throw new ForbiddenException('Solo el propietario puede gestionar el catálogo de voces');
    return this.svc.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    if (req.user?.role !== 'owner') throw new ForbiddenException('Solo el propietario puede gestionar el catálogo de voces');
    return this.svc.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: any) {
    if (req.user?.role !== 'owner') throw new ForbiddenException('Solo el propietario puede gestionar el catálogo de voces');
    return this.svc.remove(id);
  }
}
