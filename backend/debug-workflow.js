require('dotenv').config();
const { db } = require('./dist/src/database/db.connection');
const { sql } = require('drizzle-orm');

async function debug() {
  console.log('=== Workflow Debug Info ===\n');

  // Get workflow nodes
  const nodes = await db.execute(
    sql`SELECT id, node_type, label, config, ai_instructions, ai_tone, ai_goal
        FROM workflow_nodes 
        WHERE workflow_id = 'c94faa67-1a33-48b3-af65-d4b2c6e7f17d'
        ORDER BY created_at`,
  );
  console.log('=== Workflow Nodes ===');
  nodes.rows.forEach((n, i) => {
    console.log(`\n${i + 1}. ${n.label} (${n.node_type})`);
    console.log(`   ID: ${n.id}`);
    if (n.config?._originalNodeType)
      console.log(`   Original type: ${n.config._originalNodeType}`);
    console.log(`   Config:`, JSON.stringify(n.config, null, 2));
    if (n.ai_instructions)
      console.log(
        `   AI Instructions: ${n.ai_instructions.substring(0, 80)}...`,
      );
    if (n.ai_tone) console.log(`   AI Tone: ${n.ai_tone}`);
  });

  // Get connections
  const connections = await db.execute(
    sql`SELECT from_node_id, to_node_id, branch
        FROM workflow_connections 
        WHERE workflow_id = 'c94faa67-1a33-48b3-af65-d4b2c6e7f17d'`,
  );
  console.log('\n\n=== Connections ===');
  connections.rows.forEach((c, i) => {
    const fromNode = nodes.rows.find((n) => n.id === c.from_node_id);
    const toNode = nodes.rows.find((n) => n.id === c.to_node_id);
    console.log(
      `${i + 1}. ${fromNode?.label || c.from_node_id} --[${c.branch}]--> ${toNode?.label || c.to_node_id}`,
    );
  });

  // Get latest execution
  const exec = await db.execute(
    sql`SELECT id, status, nodes_executed, current_node_id
        FROM workflow_executions 
        WHERE workflow_id = 'c94faa67-1a33-48b3-af65-d4b2c6e7f17d'
        ORDER BY started_at DESC
        LIMIT 1`,
  );
  console.log('\n\n=== Latest Execution ===');
  if (exec.rows[0]) {
    console.log(`ID: ${exec.rows[0].id}`);
    console.log(`Status: ${exec.rows[0].status}`);
    console.log(`Nodes executed: ${exec.rows[0].nodes_executed}`);
    console.log(`Current node: ${exec.rows[0].current_node_id}`);

    // Get logs for this execution
    const logs = await db.execute(
      sql`SELECT node_id, node_type, status, output
          FROM workflow_execution_logs 
          WHERE execution_id = ${exec.rows[0].id}
          ORDER BY executed_at`,
    );
    console.log('\n=== Execution Logs ===');
    logs.rows.forEach((log, i) => {
      const nodeName =
        nodes.rows.find((n) => n.id === log.node_id)?.label || log.node_id;
      console.log(`${i + 1}. ${nodeName} (${log.node_type}): ${log.status}`);
    });
  }

  // Get chat state
  const state = await db.execute(
    sql`SELECT * FROM workflow_chat_state WHERE chat_id = 'chat_15551376021_59167131914'`,
  );
  console.log('\n\n=== Chat State ===');
  if (state.rows[0]) {
    console.log(
      `Active workflow: ${state.rows[0].active_workflow_id || 'NONE'}`,
    );
    console.log(
      `Active execution: ${state.rows[0].active_execution_id || 'NONE'}`,
    );
    console.log(`Current node: ${state.rows[0].current_node_id || 'NONE'}`);
    console.log(
      `AI Instructions: ${state.rows[0].current_ai_instructions || 'NONE'}`,
    );
    console.log(`AI Tone: ${state.rows[0].current_ai_tone || 'NONE'}`);
  }
}

debug()
  .catch(console.error)
  .finally(() => process.exit(0));
