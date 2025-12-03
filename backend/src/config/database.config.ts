import { registerAs } from '@nestjs/config';

export const databaseConfig = registerAs('database', () => ({
  url: process.env.DATABASE_URL || '',
  migrationsDir: 'src/database/migrations',
  seed: process.env.NODE_ENV !== 'production',
}));
