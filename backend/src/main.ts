import { NestFactory } from '@nestjs/core';
import * as bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { closeDbPool } from './database/db.connection';
declare const module: any;

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // Disable built-in body parser to use custom configuration
    bodyParser: false,
  });

  // Parse incoming cookies so they're available in req.cookies
  app.use(cookieParser());

  // Custom body parser with route-specific limits
  // IMPORTANT: Route-specific parsers must be applied BEFORE the default parser
  // because Express middleware runs in order and the first matching parser wins

  // WhatsApp Media Limits (https://developers.facebook.com/docs/whatsapp/cloud-api/reference/media):
  // - Images: 5 MB
  // - Videos: 16 MB (but we accept 100MB for compression)
  // - Audio: 16 MB
  // - Documents: 100 MB
  // Base64 encoding adds ~33% overhead, so we need: 100MB * 1.33 ≈ 133MB
  // Using 150MB limit to provide buffer for JSON wrapper overhead

  // Large limit for template media upload endpoints (supports documents up to 100MB)
  app.use('/templates/media', bodyParser.json({ limit: '150mb' }));
  app.use(
    '/templates/:id/locales/:localeId/media',
    bodyParser.json({ limit: '150mb' }),
  );

  // Large limit for WhatsApp media uploads (same limits apply)
  app.use('/whatsapp/media', bodyParser.json({ limit: '150mb' }));

  // Knowledge Base media uploads (supports documents up to 100MB)
  app.use('/knowledge-base/media', bodyParser.json({ limit: '150mb' }));

  // Middleware to capture raw body for webhook signature verification
  // MUST be applied BEFORE the default body parser to capture the raw stream
  // Meta Cloud API sends JSON webhooks and signs the raw body
  app.use('/webhook/whatsapp', (req, res, next) => {
    console.log('🔌 Raw body middleware triggered');
    let data = '';
    req.on('data', (chunk) => {
      console.log('📥 Receiving chunk:', chunk.length, 'bytes');
      data += chunk.toString();
    });
    req.on('end', () => {
      console.log('✅ Body received completely:', data.length, 'bytes');
      // Store raw body for signature verification
      (req as any).rawBody = data;
      try {
        // Parse JSON body
        req.body = JSON.parse(data);
        console.log('✅ JSON parsed successfully');
      } catch (e) {
        console.log('⚠️ JSON parse failed, trying URLSearchParams');
        // If not JSON, try form data parsing (for potential backward compatibility)
        const params = new URLSearchParams(data);
        req.body = Object.fromEntries(params);
      }
      next();
    });
  });

  // Default limit for all other routes (1MB is reasonable for most requests)
  app.use(bodyParser.json({ limit: '1mb' }));
  app.use(bodyParser.urlencoded({ extended: true, limit: '1mb' }));

  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // Global logging middleware to debug all requests
  app.use((req, res, next) => {
    // Skip logging for frequent status checks (they're too noisy)
    const isStatusCheck = req.url.includes('/whatsapp/status/');

    if (
      !isStatusCheck &&
      (req.url.includes('webhook') || req.url.includes('whatsapp'))
    ) {
      console.log(
        `\n📨 [${new Date().toISOString()}] ${req.method} ${req.url}`,
      );
      console.log('IP:', req.ip);
      console.log('Headers:', {
        'content-type': req.headers['content-type'],
        'content-length': req.headers['content-length'],
        'x-hub-signature-256': req.headers['x-hub-signature-256'],
      });
    }
    next();
  });

  await app.listen(process.env.PORT ?? 3001);
  console.log(`✅ Backend running on port ${process.env.PORT ?? 3001}`);
  console.log(
    `✅ CORS enabled for: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`,
  );

  // Graceful shutdown handlers
  const gracefulShutdown = async (signal: string) => {
    console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);
    try {
      await app.close();
      console.log('✅ Nest application closed');
      await closeDbPool();
      console.log('✅ Database pool closed');
      process.exit(0);
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  if (module.hot) {
    module.hot.accept();
    module.hot.dispose(async () => {
      console.log('🔄 HMR dispose - closing app and pool...');
      await closeDbPool();
      await app.close();
    });
  }
}
bootstrap();
