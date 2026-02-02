require('dotenv').config();
const { db } = require('./dist/src/database/db.connection');
const schema = require('./dist/src/database/schema');
const { eq } = require('drizzle-orm');

async function reset() {
  // Re-assign workflow to chat
  await db
    .insert(schema.workflowChatState)
    .values({
      chatId: 'chat_15551376021_59167131914',
      activeWorkflowId: 'c94faa67-1a33-48b3-af65-d4b2c6e7f17d',
      activeExecutionId: null,
      currentNodeId: null,
      enteredWorkflowAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: schema.workflowChatState.chatId,
      set: {
        activeWorkflowId: 'c94faa67-1a33-48b3-af65-d4b2c6e7f17d',
        activeExecutionId: null,
        currentNodeId: null,
        enteredWorkflowAt: new Date(),
        updatedAt: new Date(),
      },
    });
  console.log('✅ Workflow reassigned to chat');

  // Verify
  const state = await db.query.workflowChatState.findFirst({
    where: eq(schema.workflowChatState.chatId, 'chat_15551376021_59167131914'),
  });
  console.log('Current state:');
  console.log('  - activeWorkflowId:', state?.activeWorkflowId || 'NONE');
  console.log('  - activeExecutionId:', state?.activeExecutionId || 'NONE');
  console.log('  - currentNodeId:', state?.currentNodeId || 'NONE');
  console.log(
    '  - currentAiInstructions:',
    state?.currentAiInstructions || 'NONE',
  );
}

reset()
  .catch(console.error)
  .finally(() => process.exit(0));
