/**
 * SSM Parameter Store utilities
 * Caches values for 5 minutes to reduce API calls
 */

import {
  SSMClient,
  GetParameterCommand,
  GetParameterCommandInput,
} from "@aws-sdk/client-ssm";

const client = new SSMClient({});

interface CachedValue {
  value: string;
  expiresAt: number;
}

const cache = new Map<string, CachedValue>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Get parameter value from SSM Parameter Store with caching
 */
export async function getSSMParameter(name: string): Promise<string> {
  const now = Date.now();
  const cached = cache.get(name);

  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const input: GetParameterCommandInput = {
    Name: name,
    WithDecryption: true,
  };

  const command = new GetParameterCommand(input);
  const response = await client.send(command);

  if (!response.Parameter?.Value) {
    throw new Error(`SSM parameter ${name} not found or empty`);
  }

  const value = response.Parameter.Value;

  cache.set(name, {
    value,
    expiresAt: now + CACHE_TTL_MS,
  });

  return value;
}
