import { Controller, Post, Get, Delete, Body, Param, Headers, Req, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { McpService } from './mcp.service';

@Controller('mcp')
export class McpController {
  constructor(private readonly mcp: McpService) {}

  // ── MCP JSON-RPC endpoint (bearer-token auth, no JWT) ─────────────────────────

  @Post()
  async rpc(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: any,
    @Res() res: Response,
  ) {
    const auth = await this.mcp.authenticate(authorization);
    if (!auth) {
      res.setHeader('WWW-Authenticate', 'Bearer realm="AutoMarkIQ MCP"');
      return res.status(401).json({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Unauthorized: missing or invalid MCP token' } });
    }

    // Support a single message or a batch array.
    if (Array.isArray(body)) {
      const out = (await Promise.all(body.map((m) => this.mcp.handleRpc(auth, m)))).filter((r) => r !== null);
      return res.status(200).json(out);
    }
    const result = await this.mcp.handleRpc(auth, body);
    if (result === null) return res.status(202).send(); // notification — no body
    return res.status(200).json(result);
  }

  // ── Token management (owner only, JWT) ────────────────────────────────────────

  @Get('tokens')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('owner')
  listTokens(@TenantId() tenantId: string) {
    return this.mcp.listTokens(tenantId);
  }

  @Post('tokens')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('owner')
  createToken(@TenantId() tenantId: string, @Req() req: any, @Body() dto: { label?: string }) {
    return this.mcp.createToken(tenantId, req.user?.id, dto?.label);
  }

  @Delete('tokens/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('owner')
  revokeToken(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.mcp.revokeToken(tenantId, id);
  }
}
