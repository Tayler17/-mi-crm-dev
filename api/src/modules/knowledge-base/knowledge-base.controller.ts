import {
  Controller, Get, Post, Delete, Param, Body, UseGuards,
  UseInterceptors, UploadedFile, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { KnowledgeBaseService } from './knowledge-base.service';

const PDF_UPLOAD_DIR = '/app/uploads/kb-pdfs';

@Controller()
@UseGuards(JwtAuthGuard)
export class KnowledgeBaseController {
  constructor(private readonly svc: KnowledgeBaseService) {}

  // ── Allowed domains ──────────────────────────────────────────────────────────

  @Get('knowledge-base/domains')
  getDomains(@TenantId() tenantId: string) {
    return this.svc.getDomains(tenantId);
  }

  @Post('knowledge-base/domains')
  addDomain(@TenantId() tenantId: string, @Body('domain') domain: string) {
    if (!domain) throw new BadRequestException('domain requerido');
    return this.svc.addDomain(tenantId, domain);
  }

  @Delete('knowledge-base/domains/:id')
  removeDomain(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.svc.removeDomain(tenantId, id);
  }

  // ── Sources per bot ──────────────────────────────────────────────────────────

  @Get('ai-chatbots/:botId/knowledge-sources')
  getSources(@Param('botId') botId: string, @TenantId() tenantId: string) {
    return this.svc.getSources(botId, tenantId);
  }

  @Post('ai-chatbots/:botId/knowledge-sources/url')
  addUrl(
    @Param('botId') botId: string,
    @TenantId() tenantId: string,
    @Body('url') url: string,
  ) {
    if (!url) throw new BadRequestException('url requerida');
    return this.svc.addUrlSource(botId, tenantId, url);
  }

  @Post('ai-chatbots/:botId/knowledge-sources/pdf')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: PDF_UPLOAD_DIR,
        filename: (_req, file, cb) => {
          const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
          cb(null, `${unique}${extname(file.originalname)}`);
        },
      }),
      fileFilter: (_req, file, cb) => {
        if (file.mimetype !== 'application/pdf') {
          cb(new BadRequestException('Solo se aceptan archivos PDF'), false);
        } else {
          cb(null, true);
        }
      },
      limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
    }),
  )
  async addPdf(
    @Param('botId') botId: string,
    @TenantId() tenantId: string,
    @UploadedFile() file: { originalname: string; path: string; mimetype: string },
  ) {
    if (!file) throw new BadRequestException('Archivo PDF requerido');
    return this.svc.addPdfSource(botId, tenantId, file.originalname, file.path);
  }

  @Post('ai-chatbots/:botId/knowledge-sources/:sourceId/reindex')
  reindex(@Param('sourceId') sourceId: string, @TenantId() tenantId: string) {
    return this.svc.reindexSource(sourceId, tenantId);
  }

  @Delete('ai-chatbots/:botId/knowledge-sources/:sourceId')
  deleteSource(@Param('sourceId') sourceId: string, @TenantId() tenantId: string) {
    return this.svc.deleteSource(sourceId, tenantId);
  }

  // ── Call Bot knowledge sources (same service, different prefix) ───────────────

  @Get('call-bots/:botId/knowledge-sources')
  getCallBotSources(@Param('botId') botId: string, @TenantId() tenantId: string) {
    return this.svc.getSources(botId, tenantId);
  }

  @Post('call-bots/:botId/knowledge-sources/url')
  addCallBotUrl(
    @Param('botId') botId: string,
    @TenantId() tenantId: string,
    @Body('url') url: string,
  ) {
    if (!url) throw new BadRequestException('url requerida');
    return this.svc.addUrlSource(botId, tenantId, url);
  }

  @Post('call-bots/:botId/knowledge-sources/pdf')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: PDF_UPLOAD_DIR,
        filename: (_req, file, cb) => {
          const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
          cb(null, `${unique}${extname(file.originalname)}`);
        },
      }),
      fileFilter: (_req, file, cb) => {
        if (file.mimetype !== 'application/pdf') {
          cb(new BadRequestException('Solo se aceptan archivos PDF'), false);
        } else {
          cb(null, true);
        }
      },
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  async addCallBotPdf(
    @Param('botId') botId: string,
    @TenantId() tenantId: string,
    @UploadedFile() file: { originalname: string; path: string; mimetype: string },
  ) {
    if (!file) throw new BadRequestException('Archivo PDF requerido');
    return this.svc.addPdfSource(botId, tenantId, file.originalname, file.path);
  }

  @Post('call-bots/:botId/knowledge-sources/:sourceId/reindex')
  reindexCallBot(@Param('sourceId') sourceId: string, @TenantId() tenantId: string) {
    return this.svc.reindexSource(sourceId, tenantId);
  }

  @Delete('call-bots/:botId/knowledge-sources/:sourceId')
  deleteCallBotSource(@Param('sourceId') sourceId: string, @TenantId() tenantId: string) {
    return this.svc.deleteSource(sourceId, tenantId);
  }
}
