import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
declare const module: any;

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS with explicit configuration
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    optionsSuccessStatus: 200,
    preflightContinue: false,
  });

  // Global logging middleware to debug all requests
  app.use((req, res, next) => {
    if (req.url.includes('webhook') || req.url.includes('whatsapp')) {
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

  if (module.hot) {
    module.hot.accept();
    module.hot.dispose(() => app.close());
  }
}
bootstrap();
