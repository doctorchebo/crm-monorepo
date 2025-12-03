import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
declare const module: any;

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS for frontend communication
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3001',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Configure URL-encoded form data parser for Twilio webhooks
  // Twilio sends webhook data as application/x-www-form-urlencoded, not JSON
  app.use('/webhook/whatsapp', (req, res, next) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk.toString();
    });
    req.on('end', () => {
      // Parse form data manually for webhook authentication
      req.rawBody = data;
      // Convert form data to JSON for body parser
      const params = new URLSearchParams(data);
      req.body = Object.fromEntries(params);
      next();
    });
  });

  await app.listen(process.env.PORT ?? 3001);
  console.log(`✅ Backend running on port ${process.env.PORT ?? 3001}`);
  console.log(
    `✅ CORS enabled for: ${process.env.FRONTEND_URL || 'http://localhost:3001'}`,
  );

  if (module.hot) {
    module.hot.accept();
    module.hot.dispose(() => app.close());
  }
}
bootstrap();
