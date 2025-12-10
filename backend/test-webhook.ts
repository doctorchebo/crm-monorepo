/**
 * Test script to simulate different WhatsApp webhook messages
 * Run: npx ts-node test-webhook.ts
 */

import * as crypto from 'crypto';

const WEBHOOK_URL = 'http://localhost:3001/webhook/whatsapp';
const META_APP_SECRET =
  process.env.META_APP_SECRET || 'your_meta_app_secret_here';

// Helper to create valid signature
function createSignature(payload: string): string {
  return (
    'sha256=' +
    crypto.createHmac('sha256', META_APP_SECRET).update(payload).digest('hex')
  );
}

// Test message payloads
const testMessages = {
  text: {
    name: 'Text Message',
    payload: {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: '0',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: '16505551111',
                  phone_number_id: '123456123',
                },
                contacts: [
                  {
                    profile: { name: 'John Doe' },
                    wa_id: '16315551181',
                  },
                ],
                messages: [
                  {
                    from: '16315551181',
                    id: `msg_text_${Date.now()}`,
                    timestamp: Math.floor(Date.now() / 1000).toString(),
                    type: 'text',
                    text: { body: 'Hello! This is a test text message.' },
                  },
                ],
              },
            },
          ],
        },
      ],
    },
  },

  image: {
    name: 'Image Message',
    payload: {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: '0',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: '16505551111',
                  phone_number_id: '123456123',
                },
                contacts: [
                  {
                    profile: { name: 'Jane Smith' },
                    wa_id: '16315551182',
                  },
                ],
                messages: [
                  {
                    from: '16315551182',
                    id: `msg_image_${Date.now()}`,
                    timestamp: Math.floor(Date.now() / 1000).toString(),
                    type: 'image',
                    image: {
                      mime_type: 'image/jpeg',
                      sha256: 'hash_of_image',
                      id: 'wamid_image_123',
                      caption: 'Check out this image!',
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    },
  },

  video: {
    name: 'Video Message',
    payload: {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: '0',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: '16505551111',
                  phone_number_id: '123456123',
                },
                contacts: [
                  {
                    profile: { name: 'Bob Johnson' },
                    wa_id: '16315551183',
                  },
                ],
                messages: [
                  {
                    from: '16315551183',
                    id: `msg_video_${Date.now()}`,
                    timestamp: Math.floor(Date.now() / 1000).toString(),
                    type: 'video',
                    video: {
                      mime_type: 'video/mp4',
                      sha256: 'hash_of_video',
                      id: 'wamid_video_456',
                      caption: 'Here is a video',
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    },
  },

  audio: {
    name: 'Audio Message',
    payload: {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: '0',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: '16505551111',
                  phone_number_id: '123456123',
                },
                contacts: [
                  {
                    profile: { name: 'Alice Brown' },
                    wa_id: '16315551184',
                  },
                ],
                messages: [
                  {
                    from: '16315551184',
                    id: `msg_audio_${Date.now()}`,
                    timestamp: Math.floor(Date.now() / 1000).toString(),
                    type: 'audio',
                    audio: {
                      mime_type: 'audio/mpeg',
                      sha256: 'hash_of_audio',
                      id: 'wamid_audio_789',
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    },
  },

  document: {
    name: 'Document Message',
    payload: {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: '0',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: '16505551111',
                  phone_number_id: '123456123',
                },
                contacts: [
                  {
                    profile: { name: 'Charlie Davis' },
                    wa_id: '16315551185',
                  },
                ],
                messages: [
                  {
                    from: '16315551185',
                    id: `msg_doc_${Date.now()}`,
                    timestamp: Math.floor(Date.now() / 1000).toString(),
                    type: 'document',
                    document: {
                      mime_type: 'application/pdf',
                      sha256: 'hash_of_doc',
                      id: 'wamid_doc_000',
                      filename: 'invoice.pdf',
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    },
  },
};

async function sendTestMessage(messageType: keyof typeof testMessages) {
  const test = testMessages[messageType];
  const payload = JSON.stringify(test.payload);
  const signature = createSignature(payload);

  console.log(`\n📤 Sending ${test.name}...`);
  console.log(`Webhook URL: ${WEBHOOK_URL}`);
  console.log(`Signature: ${signature}`);

  try {
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hub-signature-256': signature,
      },
      body: payload,
    });

    if (response.ok) {
      console.log(`✅ ${test.name} sent successfully!`);
      const result = await response.json();
      console.log('Response:', result);
    } else {
      console.error(`❌ Error: ${response.status} ${response.statusText}`);
      const error = await response.text();
      console.error('Response:', error);
    }
  } catch (error) {
    console.error(`❌ Failed to send ${test.name}:`, error);
  }
}

async function main() {
  const messageType = process.argv[2] as keyof typeof testMessages;

  if (!messageType || !testMessages[messageType]) {
    console.log('Test Script for WhatsApp Webhook');
    console.log('================================\n');
    console.log('Usage: npx ts-node test-webhook.ts [message-type]\n');
    console.log('Available message types:');
    Object.keys(testMessages).forEach((key) => {
      console.log(`  - ${key}`);
    });
    console.log('\nExample: npx ts-node test-webhook.ts text');
    return;
  }

  await sendTestMessage(messageType);
}

main().catch(console.error);
