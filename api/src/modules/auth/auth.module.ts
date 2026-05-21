import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { User } from './entities/user.entity';
import { Tenant } from './entities/tenant.entity';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { OnboardingEmailService } from './onboarding-email.service';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Tenant]),
    SettingsModule,
    PassportModule,
    ScheduleModule.forRoot(),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_SECRET') || (config.get('NODE_ENV') === 'production' ? (() => { throw new Error('JWT_SECRET env var is required in production'); })() : 'dev_jwt_secret'),
        signOptions: { expiresIn: '7d' },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [AuthService, JwtStrategy, OnboardingEmailService],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
