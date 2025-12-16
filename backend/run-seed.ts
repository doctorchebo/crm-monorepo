/**
 * Run database seeding
 * Usage: npx ts-node run-seed.ts
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { seed } from './src/database/seed';

async function main() {
  console.log('Starting seed script...');
  console.log(
    'DATABASE_URL:',
    process.env.DATABASE_URL ? '✅ Set' : '❌ Missing',
  );

  await seed();
}

main()
  .then(() => {
    console.log('\n✅ Seed completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Seed failed:', error);
    process.exit(1);
  });
