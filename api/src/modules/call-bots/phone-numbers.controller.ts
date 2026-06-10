import { Controller, Get, Post, Delete, Query, Body, Param, Res, UseGuards, Request, ForbiddenException, UseInterceptors, UploadedFile, BadRequestException, NotFoundException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { existsSync, mkdirSync, writeFileSync, createReadStream } from 'fs';
import { join, extname, basename } from 'path';
import { randomBytes } from 'crypto';
import type { Response } from 'express';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PhoneNumbersService } from './phone-numbers.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { checkPlanLimit } from '../../common/utils/limits';

@Controller('phone-numbers')
@UseGuards(JwtAuthGuard)
export class PhoneNumbersController {
  constructor(
    private readonly svc: PhoneNumbersService,
    @InjectDataSource() private readonly db: DataSource,
  ) {}

  /** Live Twilio inventory search */
  @Get('search')
  search(
    @Query('country') country?: string,
    @Query('type') type?: string,
    @Query('areaCode') areaCode?: string,
    @Query('contains') contains?: string,
  ) {
    return this.svc.search({ country, type, areaCode, contains });
  }

  /** The tenant's purchased numbers */
  @Get()
  list(@TenantId() tenantId: string) {
    return this.svc.list(tenantId);
  }

  /** Buy a number on demand (admin/owner only, gated by plan limit) */
  @Post('buy')
  async buy(
    @Body() body: { phoneNumber: string; country?: string; type?: string },
    @TenantId() tenantId: string,
    @Request() req: any,
  ) {
    if (req.user?.role === 'agent') throw new ForbiddenException('Solo administradores pueden comprar números.');
    await checkPlanLimit(this.db, tenantId, 'phone_numbers');
    return this.svc.purchase(tenantId, body.phoneNumber, body.country, body.type || 'local');
  }

  // ── Regulatory verification per tenant (Enfoque A) ──────────────────────────

  /** Tenant: list own verification requests */
  @Get('regulatory')
  listRegulatory(@TenantId() tenantId: string) {
    return this.svc.listRegulatory(tenantId);
  }

  /** Tenant admin/owner: submit a verification request */
  @Post('regulatory')
  submitRegulatory(
    @Body() body: { country: string; numberType?: string; businessName?: string; contactEmail?: string; addressText?: string; docUrls?: string[] },
    @TenantId() tenantId: string,
    @Request() req: any,
  ) {
    if (req.user?.role === 'agent') throw new ForbiddenException('Solo administradores pueden solicitar verificación.');
    return this.svc.submitRegulatory(tenantId, body);
  }

  /** Upload a supporting document → returns a stored URL */
  @Post('regulatory/upload')
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const ok = /\.(pdf|jpe?g|png|webp)$/i.test(file.originalname);
      cb(ok ? null : new BadRequestException('Solo PDF o imágenes (jpg, png, webp)'), ok);
    },
  }))
  uploadDoc(@UploadedFile() file: any, @Request() req: any) {
    if (req.user?.role === 'agent') throw new ForbiddenException();
    if (!file) throw new BadRequestException('Archivo requerido');
    const dir = join(process.cwd(), 'uploads', 'regulatory');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    // Random, unguessable name. These are sensitive ID documents — NOT served statically;
    // only the owner can fetch them via the authenticated endpoint below.
    const filename = `reg-${randomBytes(16).toString('hex')}${extname(file.originalname) || '.bin'}`;
    writeFileSync(join(dir, filename), file.buffer);
    return { url: filename, name: file.originalname };
  }

  /** Owner: download a supporting document (authenticated, not public) */
  @Get('regulatory/doc/:filename')
  downloadDoc(@Param('filename') filename: string, @Res() res: Response, @Request() req: any) {
    if (req.user?.role !== 'owner') throw new ForbiddenException();
    const safe = basename(filename); // prevent path traversal
    const path = join(process.cwd(), 'uploads', 'regulatory', safe);
    if (!safe.startsWith('reg-') || !existsSync(path)) throw new NotFoundException('Documento no encontrado');
    createReadStream(path).pipe(res);
  }

  /** Owner: list all verification requests across tenants */
  @Get('regulatory/all')
  listAllRegulatory(@Request() req: any) {
    if (req.user?.role !== 'owner') throw new ForbiddenException();
    return this.svc.listAllRegulatory();
  }

  /** Owner: Twilio Addresses (AD...) for the approval dropdown */
  @Get('twilio-addresses')
  twilioAddresses(@Request() req: any) {
    if (req.user?.role !== 'owner') throw new ForbiddenException();
    return this.svc.listTwilioAddresses();
  }

  /** Owner: Twilio Regulatory Bundles (BU...) for the approval dropdown */
  @Get('twilio-bundles')
  twilioBundles(@Request() req: any) {
    if (req.user?.role !== 'owner') throw new ForbiddenException();
    return this.svc.listTwilioBundles();
  }

  /** Owner: approve a request with the Twilio Bundle + Address SIDs */
  @Post('regulatory/:id/approve')
  approveRegulatory(@Param('id') id: string, @Body() body: { bundleSid?: string; addressSid?: string }, @Request() req: any) {
    if (req.user?.role !== 'owner') throw new ForbiddenException();
    return this.svc.approveRegulatory(id, body.bundleSid ?? '', body.addressSid ?? '');
  }

  /** Owner: reject a request */
  @Post('regulatory/:id/reject')
  rejectRegulatory(@Param('id') id: string, @Body() body: { notes?: string }, @Request() req: any) {
    if (req.user?.role !== 'owner') throw new ForbiddenException();
    return this.svc.rejectRegulatory(id, body.notes ?? '');
  }

  /** Release a number (admin/owner only) */
  @Delete(':id')
  async release(@Param('id') id: string, @TenantId() tenantId: string, @Request() req: any) {
    if (req.user?.role === 'agent') throw new ForbiddenException('Solo administradores pueden liberar números.');
    return this.svc.release(tenantId, id);
  }

  /** Owner: list all numbers in the master Twilio account */
  @Get('twilio-inventory')
  twilioInventory(@Request() req: any) {
    if (req.user?.role !== 'owner') throw new ForbiddenException();
    return this.svc.twilioInventory();
  }

  /** Owner: assign an existing Twilio number to a specific tenant */
  @Post('assign')
  assign(@Body() body: { phoneNumber: string; tenantId: string }, @Request() req: any) {
    if (req.user?.role !== 'owner') throw new ForbiddenException();
    return this.svc.assignToTenant(body.tenantId, body.phoneNumber);
  }
}
