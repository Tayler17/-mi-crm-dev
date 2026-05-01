import * as Sentry from '@sentry/node';
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,
  });
}

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { AppModule } from './app.module';
import { SentryInterceptor } from './common/interceptors/sentry.interceptor';
import { Logger } from 'nestjs-pino';

// Prevent unhandled WebSocket / EventEmitter errors from crashing the process
process.on('uncaughtException', (err: Error) => {
  console.error('[uncaughtException]', err?.message ?? err);
});
process.on('unhandledRejection', (reason: any) => {
  console.error('[unhandledRejection]', reason?.message ?? reason);
});

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false, // We set our own limits below
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));

  // Body parser limits: 10 MB for webhooks/media, still sane for REST
  const express = await import('express');
  // Stripe webhook needs the raw body for signature verification
  app.use('/billing/webhook', express.raw({ type: 'application/json' }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Ensure uploads directory exists and serve it as static files at /uploads
  const uploadsDir = join(process.cwd(), 'uploads');
  if (!existsSync(uploadsDir)) mkdirSync(uploadsDir, { recursive: true });
  app.useStaticAssets(uploadsDir, { prefix: '/uploads' });

  const config = new DocumentBuilder()
    .setTitle('CRM SaaS API')
    .setDescription('API CRM Multi-tenant')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  app.useGlobalInterceptors(new SentryInterceptor());

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));

  const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000')
    .split(',').map((o) => o.trim());

  app.enableCors({
    origin: (origin, callback) => {
      // CRM dashboard + webchat widget (embedded on any site) both allowed.
      // Security is enforced by JWT tokens, not CORS origin checks.
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        // Allow external origins for webchat widget embeds
        callback(null, origin);
      }
    },
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID'],
    credentials: true,
  });

  const port = process.env.PORT || 4000;
  await app.listen(port);
  app.get(Logger).log(`API CRM SaaS arrancada en: http://localhost:${port}`);
}
bootstrap();
