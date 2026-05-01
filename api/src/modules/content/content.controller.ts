import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  UseGuards, Request, UploadedFile, UseInterceptors, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { ContentService } from './content.service';
import { CreateContentPostDto, UpdateContentPostDto, GenerateContentDto } from './dto/content.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

const CONTENT_UPLOAD_DIR = join(process.cwd(), 'uploads', 'content');

@UseGuards(JwtAuthGuard)
@Controller('content')
export class ContentController {
  constructor(private readonly svc: ContentService) {}

  @Get()
  findAll(
    @Request() req: any,
    @Query('status')  status?: string,
    @Query('channel') channel?: string,
  ) {
    return this.svc.findAll(req.user.tenantId, status, channel);
  }

  @Post('generate')
  generate(@Body() dto: GenerateContentDto) {
    return this.svc.generate(dto);
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: (_req, _file, cb) => {
        if (!existsSync(CONTENT_UPLOAD_DIR)) mkdirSync(CONTENT_UPLOAD_DIR, { recursive: true });
        cb(null, CONTENT_UPLOAD_DIR);
      },
      filename: (_req, file, cb) => {
        const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        cb(null, `${unique}${extname(file.originalname)}`);
      },
    }),
    fileFilter: (_req, file, cb) => {
      if (!/\.(jpg|jpeg|png|gif|webp|svg|avif)$/i.test(file.originalname)) {
        return cb(new BadRequestException('Solo se permiten imágenes (jpg, png, gif, webp, svg, avif)'), false);
      }
      cb(null, true);
    },
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  }))
  uploadMedia(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No se recibió ningún archivo');
    const mediaType = /\.gif$/i.test(file.originalname) ? 'gif' : 'image';
    return { url: `/uploads/content/${file.filename}`, mediaType };
  }

  @Get(':id/schedule')
  getSchedule(@Param('id') id: string) {
    return this.svc.getScheduleInfo(id);
  }

  @Get(':id')
  findOne(@Request() req: any, @Param('id') id: string) {
    return this.svc.findOne(req.user.tenantId, id);
  }

  @Post()
  create(@Request() req: any, @Body() dto: CreateContentPostDto) {
    return this.svc.create(req.user.tenantId, dto, { id: req.user.userId, fullName: req.user.fullName ?? '' });
  }

  @Patch(':id')
  update(@Request() req: any, @Param('id') id: string, @Body() dto: UpdateContentPostDto) {
    return this.svc.update(req.user.tenantId, id, dto);
  }

  @Delete(':id')
  remove(@Request() req: any, @Param('id') id: string) {
    return this.svc.remove(req.user.tenantId, id);
  }
}
