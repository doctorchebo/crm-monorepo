import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { closeDbPool } from './database/db.connection';
declare const module: any;

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Parse incoming cookies so they're available in req.cookies

  app.use(cookieParser());

  // Set request size limits for file uploads
  app.use((req, res, next) => {
    if (req.method === 'POST' && req.url.includes('/whatsapp/media/upload')) {
      req.headers['content-length'] = Math.min(
        50 * 1024 * 1024,
        req.headers['content-length']
          ? parseInt(req.headers['content-length'])
          : 0,
      ).toString();
    }
    next();
  });

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

  // Middleware to capture raw body for webhook signature verification
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
      req.rawBody = data;
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
