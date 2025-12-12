require('dotenv').config();
const { hash } = require('bcryptjs');
const { db } = require('./dist/database/db.connection');
const { users } = require('./dist/database/schema');

async function createTestUser() {
  try {
    const hashedPassword = await hash('password', 10);

    const result = await db
      .insert(users)
      .values({
        email: 'test@test.com',
        name: 'Test User',
        passwordHash: hashedPassword,
      })
      .returning();

    console.log('✅ Test user created:', result[0]);
  } catch (error) {
    if (error.message.includes('unique constraint')) {
      console.log('⚠️ Test user already exists');
    } else {
      console.error('❌ Error creating test user:', error.message);
    }
  }
  process.exit(0);
}

createTestUser();
