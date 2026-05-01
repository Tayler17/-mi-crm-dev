import {
  Controller, Get, Post, Delete, Param, Res, Request,
  UseGuards, ForbiddenException, NotFoundException, HttpCode,
} from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BackupsService } from './backups.service';

@Controller('backups')
@UseGuards(JwtAuthGuard)
export class BackupsController {
  constructor(private readonly svc: BackupsService) {}

  private guard(req: any) {
    const role = req.user?.role;
    if (role !== 'admin' && role !== 'owner') throw new ForbiddenException();
  }

  @Get()
  list(@Request() req: any) {
    this.guard(req);
    return this.svc.list();
  }

  @Post('trigger')
  @HttpCode(202)
  async trigger(@Request() req: any) {
    this.guard(req);
    const id = await this.svc.runBackup('manual');
    return { id };
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Request() req: any) {
    this.guard(req);
    await this.svc.deleteBackup(id);
    return { ok: true };
  }

  @Get(':filename/download')
  download(@Param('filename') filename: string, @Res() res: Response, @Request() req: any) {
    this.guard(req);
    // Prevent path traversal
    if (filename.includes('/') || filename.includes('..')) throw new NotFoundException();
    const result = this.svc.getFileStream(filename);
    if (!result) throw new NotFoundException('Archivo de backup no encontrado');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', String(result.size));
    result.stream.pipe(res);
  }
}
