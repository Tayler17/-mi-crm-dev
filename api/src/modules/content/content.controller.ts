import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  UseGuards, Request, UploadedFile, UseInterceptors, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { ContentService } from './content.service';
import { CreateContentPostDto, UpdateContentPostDto, GenerateContentDto, GenerateImageDto } from './dto/content.dto';
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
  generate(@Request() req: any, @Body() dto: GenerateContentDto) {
    return this.svc.generate(dto, req.user.tenantId);
  }

  @Post('generate-image')
  generateImage(@Request() req: any, @Body() dto: GenerateImageDto) {
    return this.svc.generateImage(req.user.tenantId, req.user.userId, dto);
  }

  @Get('image-gen/history')
  getImageHistory(@Request() req: any) {
    return this.svc.getImageHistory(req.user.tenantId);
  }

  @Get('image-gen/usage')
  getImageUsage(@Request() req: any) {
    return this.svc.getImageUsage(req.user.tenantId);
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
      if (!/\.(jpg|jpeg|png|gif|webp|svg|avif|mp4|webm|mov|avi|ogv)$/i.test(file.originalname)) {
        return cb(new BadRequestException('Formatos permitidos: jpg, png, gif, webp, svg, avif, mp4, webm, mov, avi'), false);
      }
      cb(null, true);
    },
    limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB (videos)
  }))
  uploadMedia(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No se recibió ningún archivo');
    const name = file.originalname.toLowerCase();
    const mediaType = /\.gif$/i.test(name) ? 'gif'
      : /\.(mp4|webm|mov|avi|ogv)$/i.test(name) ? 'video'
      : 'image';
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
