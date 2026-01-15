
import { handler } from './index';

// Simple runner that reads event from stdin, executes handler, and prints result
import * as fs from 'fs';

async function run() {
    try {
        // Read entire stdin
        const eventJson = fs.readFileSync(0, 'utf-8');

        if (!eventJson) {
            console.error('Usage: echo <event-json> | ts-node local-runner.ts');
            process.exit(1);
        }

        const event = JSON.parse(eventJson);

        // Execute handler
        // Handler signature is (event: SQSEvent) -> Promise<SQSBatchResponse>
        const result = await handler(event);

        // Print result to stdout for the caller to parse
        console.log(JSON.stringify(result));
        process.exit(0);
    } catch (error) {
        console.error('Execution failed:', error);
        process.exit(1);
    }
}

run();
