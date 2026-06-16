import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, Request, Query, UploadedFile, UseInterceptors, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { spawn } from 'child_process';
import { unlink } from 'fs/promises';
import { InternalChatService } from './internal-chat.service';
import { CreateChatDto, SendMessageDto, EditMessageDto } from './dto/internal-chat.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantId } from '../../common/decorators/tenant.decorator';

const CHAT_UPLOAD_DIR = join(process.cwd(), 'uploads', 'chat');

/** Transcode an audio file to mp3 so it plays on every device (iOS can't play webm/opus). */
function transcodeToMp3(inputPath: string): Promise<string> {
  const outPath = inputPath.replace(/\.[^.]+$/, '') + '.mp3';
  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', ['-y', '-i', inputPath, '-vn', '-acodec', 'libmp3lame', '-q:a', '4', outPath]);
    let err = '';
    ff.stderr?.on('data', (d) => (err += d.toString()));
    ff.on('error', reject);
    ff.on('close', (code) => (code === 0 ? resolve(outPath) : reject(new Error('ffmpeg ' + err.slice(-160)))));
  });
}

@Controller('internal-chat')
@UseGuards(JwtAuthGuard)
export class InternalChatController {
  constructor(private readonly svc: InternalChatService) {}

  @Get()
  getMyChats(@TenantId() tenantId: string, @Request() req: any) {
    return this.svc.findMyChats(tenantId, req.user.id);
  }

  @Post()
  createOrFindDm(
    @TenantId() tenantId: string,
    @Request() req: any,
    @Body() dto: CreateChatDto,
  ) {
    return this.svc.findOrCreateDm(tenantId, req.user.id, dto);
  }

  @Get(':id/messages')
  getMessages(
    @Param('id') chatId: string,
    @TenantId() tenantId: string,
    @Request() req: any,
    @Query('limit') limit?: string,
  ) {
    return this.svc.getMessages(chatId, tenantId, req.user.id, limit ? +limit : 50);
  }

  @Post(':id/messages')
  sendMessage(
    @Param('id') chatId: string,
    @TenantId() tenantId: string,
    @Request() req: any,
    @Body() dto: SendMessageDto,
  ) {
    return this.svc.sendMessage(chatId, tenantId, req.user.id, dto);
  }

  /** Upload an attachment (image/audio/file) → returns the URL to send in a message. */
  @Post('upload')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: (_req, _file, cb) => {
        if (!existsSync(CHAT_UPLOAD_DIR)) mkdirSync(CHAT_UPLOAD_DIR, { recursive: true });
        cb(null, CHAT_UPLOAD_DIR);
      },
      filename: (_req, file, cb) => {
        const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        cb(null, `${unique}${extname(file.originalname)}`);
      },
    }),
    limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
  }))
  async upload(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No se recibió ningún archivo');
    const name = file.originalname.toLowerCase();
    const type = /\.(jpg|jpeg|png|gif|webp|bmp|heic)$/i.test(name) ? 'image'
      : /\.(mp3|ogg|oga|wav|m4a|webm|aac)$/i.test(name) || file.mimetype?.startsWith('audio/') ? 'audio'
      : 'file';

    let filename = file.filename;
    // Audio → mp3 for universal playback. If ffmpeg isn't available, keep the original.
    if (type === 'audio' && !/\.mp3$/i.test(filename)) {
      try {
        const inputPath = join(CHAT_UPLOAD_DIR, file.filename);
        const outPath = await transcodeToMp3(inputPath);
        filename = outPath.split(/[\\/]/).pop()!;
        await unlink(inputPath).catch(() => {});
      } catch {
        // ffmpeg missing/failed → fall back to the original file.
      }
    }
    return { url: `/uploads/chat/${filename}`, attachmentType: type, attachmentName: file.originalname };
  }

  @Patch('messages/:messageId')
  editMessage(
    @Param('messageId') messageId: string,
    @TenantId() tenantId: string,
    @Request() req: any,
    @Body() dto: EditMessageDto,
  ) {
    return this.svc.editMessage(messageId, tenantId, req.user.id, dto.body);
  }

  @Delete('messages/:messageId')
  deleteMessage(
    @Param('messageId') messageId: string,
    @TenantId() tenantId: string,
    @Request() req: any,
  ) {
    return this.svc.deleteMessage(messageId, tenantId, req.user.id);
  }

  @Post(':id/read')
  markRead(@Param('id') chatId: string, @Request() req: any) {
    return this.svc.markRead(chatId, req.user.id);
  }
}
