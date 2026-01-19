/**
 * SSM Parameter Store Client
 *
 * Fetches secrets from AWS Systems Manager Parameter Store.
 * Caches values to avoid repeated API calls during Lambda invocations.
 */

import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";

// Cache for SSM parameters (persists across warm Lambda invocations)
const parameterCache: Map<string, { value: string; expiresAt: number }> =
  new Map();

// Cache TTL: 5 minutes (Lambda typically reuses containers)
const CACHE_TTL_MS = 5 * 60 * 1000;

// Lazy initialization of SSM client
let ssmClient: SSMClient | null = null;

function getSSMClient(): SSMClient {
  if (!ssmClient) {
    ssmClient = new SSMClient({
      region: process.env.AWS_REGION || "us-east-1",
    });
  }
  return ssmClient;
}

/**
 * Get a parameter from SSM Parameter Store
 * @param name - Parameter name (e.g., /crm/mailgun/api-key)
 * @param decrypt - Whether to decrypt SecureString parameters (default: true)
 * @returns The parameter value
 */
export async function getSSMParameter(
  name: string,
  decrypt: boolean = true,
): Promise<string> {
  // Check cache first
  const cached = parameterCache.get(name);
  if (cached && Date.now() < cached.expiresAt) {
    console.log(`[SSM] Cache hit for ${name}`);
    return cached.value;
  }

  console.log(`[SSM] Fetching parameter: ${name}`);

  const client = getSSMClient();
  const command = new GetParameterCommand({
    Name: name,
    WithDecryption: decrypt,
  });

  try {
    const response = await client.send(command);
    const value = response.Parameter?.Value;

    if (!value) {
      throw new Error(`Parameter ${name} not found or has no value`);
    }

    // Cache the value
    parameterCache.set(name, {
      value,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    console.log(`[SSM] Successfully fetched and cached: ${name}`);
    return value;
  } catch (error: any) {
    console.error(`[SSM] Failed to fetch ${name}: ${error.message}`);
    throw new Error(`Failed to fetch SSM parameter ${name}: ${error.message}`);
  }
}

/**
 * Clear the parameter cache (useful for testing)
 */
export function clearSSMCache(): void {
  parameterCache.clear();
}
