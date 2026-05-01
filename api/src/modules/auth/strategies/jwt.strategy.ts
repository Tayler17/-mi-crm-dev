import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly config: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_SECRET') || (process.env.NODE_ENV === 'production' ? (() => { throw new Error('JWT_SECRET env var is required in production'); })() : 'dev_jwt_secret'),
    });
  }

  async validate(payload: any) {
    const user = await this.authService.validateUser(payload.sub, payload.tenantId);
    if (!user) throw new UnauthorizedException();
    return { id: payload.sub, email: payload.email, tenantId: payload.tenantId, role: payload.role };
  }
}
