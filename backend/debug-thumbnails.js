/**
 * Debug script to check thumbnail data in database
 */
require('dotenv').config();
const { db } = require('./src/database/db.connection');
const { messages } = require('./src/database/schema');
const { isNotNull } = require('drizzle-orm');

async function check() {
  try {
    // Get messages with attachments
    const results = await db.query.messages.findMany({
      where: isNotNull(messages.attachments),
      limit: 20,
      columns: { messageId: true, attachments: true },
    });

    console.log('Checking thumbnail data in database...\n');
    let count = 0;

    for (const msg of results) {
      const atts = msg.attachments || [];
      const media = atts.filter(
        (a) => a.type === 'image' || a.type === 'video',
      );

      if (media.length > 0) {
        for (const att of media) {
          count++;
          console.log(`${count}. ${att.type} attachment:`);
          console.log(`   ID: ${att.id}`);
          console.log(`   thumbnailStatus: ${att.thumbnailStatus}`);
          console.log(`   thumbnailKey: ${att.thumbnailKey || 'NOT SET'}`);
          console.log(`   s3Key: ${att.s3Key?.substring(0, 60)}...`);
          console.log('');
        }
      }

      if (count >= 5) break;
    }

    if (count === 0) {
      console.log('No image/video attachments found');
    }
  } catch (err) {
    console.error('Error:', err);
  }

  process.exit(0);
}

check();
