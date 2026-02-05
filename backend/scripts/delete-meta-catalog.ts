/**
 * Script to delete a Meta Commerce catalog
 *
 * This script handles the common case where a catalog is linked to a WABA
 * and needs to be unlinked before it can be deleted.
 *
 * Usage:
 *   npx ts-node scripts/delete-meta-catalog.ts <catalog_id>
 *
 * Example:
 *   npx ts-node scripts/delete-meta-catalog.ts 714547694929680
 *
 * The script will:
 * 1. Check which catalogs are connected to the WABA
 * 2. Disconnect the specified catalog from WABA
 * 3. Delete the catalog from Meta
 */

import * as crypto from 'crypto';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const META_WABA_ID = process.env.META_WABA_ID;
const META_APP_SECRET = process.env.META_APP_SECRET;
const API_VERSION = 'v20.0';
const BASE_URL = 'https://graph.facebook.com';

if (!META_ACCESS_TOKEN) {
  console.error('❌ META_ACCESS_TOKEN is not set in environment variables');
  process.exit(1);
}

if (!META_WABA_ID) {
  console.error('❌ META_WABA_ID is not set in environment variables');
  process.exit(1);
}

/**
 * Generate appsecret_proof for secure API calls
 */
function getAppSecretProof(): string | undefined {
  if (!META_APP_SECRET) {
    return undefined;
  }
  return crypto
    .createHmac('sha256', META_APP_SECRET)
    .update(META_ACCESS_TOKEN!)
    .digest('hex');
}

/**
 * Build URL with authentication parameters
 */
function buildUrl(path: string, params: Record<string, string> = {}): string {
  const url = new URL(`${BASE_URL}/${API_VERSION}/${path}`);
  url.searchParams.set('access_token', META_ACCESS_TOKEN!);

  const appSecretProof = getAppSecretProof();
  if (appSecretProof) {
    url.searchParams.set('appsecret_proof', appSecretProof);
  }

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}

/**
 * Make a request to the Meta Graph API
 */
async function makeRequest<T>(
  url: string,
  method: 'GET' | 'POST' | 'DELETE' = 'GET',
  body?: Record<string, unknown>,
): Promise<T> {
  console.log(`📡 ${method} ${url.split('?')[0]}`);

  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  const data = await response.json();

  if (!response.ok) {
    const errorMessage = data.error?.message || `HTTP ${response.status}`;
    console.error('❌ API Error:', data);
    throw new Error(errorMessage);
  }

  return data as T;
}

/**
 * Get catalogs connected to WABA
 */
async function getWabaCatalogs(): Promise<Array<{ id: string; name: string }>> {
  const url = buildUrl(`${META_WABA_ID}/product_catalogs`);
  const response = await makeRequest<{
    data: Array<{ id: string; name: string }>;
  }>(url);
  return response.data || [];
}

/**
 * Get catalog info
 */
async function getCatalogInfo(catalogId: string): Promise<{
  id: string;
  name: string;
  vertical: string;
  product_count?: number;
} | null> {
  const url = buildUrl(catalogId, {
    fields: 'id,name,vertical,product_count',
  });
  try {
    return await makeRequest(url);
  } catch (error) {
    console.error(`Failed to get catalog info: ${error}`);
    return null;
  }
}

/**
 * Disconnect catalog from WABA
 */
async function disconnectCatalogFromWaba(catalogId: string): Promise<boolean> {
  const url = buildUrl(`${META_WABA_ID}/product_catalogs`, {
    catalog_id: catalogId,
  });

  try {
    const response = await makeRequest<{ success: boolean }>(url, 'DELETE');
    return response.success === true;
  } catch (error) {
    console.error(`Failed to disconnect catalog: ${error}`);
    return false;
  }
}

/**
 * Delete catalog
 */
async function deleteCatalog(catalogId: string): Promise<boolean> {
  const url = buildUrl(catalogId);

  try {
    const response = await makeRequest<{ success: boolean }>(url, 'DELETE');
    return response.success === true;
  } catch (error) {
    console.error(`Failed to delete catalog: ${error}`);
    return false;
  }
}

/**
 * Main function
 */
async function main() {
  const catalogId = process.argv[2];

  if (!catalogId) {
    console.log(
      'Usage: npx ts-node scripts/delete-meta-catalog.ts <catalog_id>',
    );
    console.log('');
    console.log('This script will:');
    console.log('1. List catalogs connected to your WABA');
    console.log('2. Disconnect the specified catalog from WABA');
    console.log('3. Delete the catalog from Meta');
    console.log('');
    console.log(`WABA ID: ${META_WABA_ID}`);
    console.log('');

    // Just list catalogs if no catalog ID provided
    console.log('📋 Fetching catalogs connected to WABA...');
    const catalogs = await getWabaCatalogs();

    if (catalogs.length === 0) {
      console.log('✅ No catalogs connected to WABA');
    } else {
      console.log(`Found ${catalogs.length} catalog(s) connected to WABA:`);
      for (const catalog of catalogs) {
        console.log(`  - ${catalog.id}: ${catalog.name}`);
      }
    }
    return;
  }

  console.log('========================================');
  console.log('Meta Catalog Deletion Script');
  console.log('========================================');
  console.log(`Target Catalog ID: ${catalogId}`);
  console.log(`WABA ID: ${META_WABA_ID}`);
  console.log('');

  // Step 1: Get catalog info
  console.log('📋 Step 1: Getting catalog info...');
  const catalogInfo = await getCatalogInfo(catalogId);

  if (catalogInfo) {
    console.log(`  Name: ${catalogInfo.name}`);
    console.log(`  Vertical: ${catalogInfo.vertical}`);
    console.log(`  Product Count: ${catalogInfo.product_count || 0}`);
  } else {
    console.log('  ⚠️ Could not get catalog info (may already be deleted)');
  }
  console.log('');

  // Step 2: Check if catalog is connected to WABA
  console.log('📋 Step 2: Checking WABA connections...');
  const connectedCatalogs = await getWabaCatalogs();
  const isConnected = connectedCatalogs.some((c) => c.id === catalogId);

  if (isConnected) {
    console.log(`  ✓ Catalog ${catalogId} is connected to WABA`);
  } else {
    console.log(`  ℹ️ Catalog ${catalogId} is NOT connected to WABA`);
  }
  console.log('');

  // Step 3: Disconnect from WABA if connected
  if (isConnected) {
    console.log('📋 Step 3: Disconnecting catalog from WABA...');
    const disconnected = await disconnectCatalogFromWaba(catalogId);

    if (disconnected) {
      console.log('  ✅ Successfully disconnected catalog from WABA');
    } else {
      console.log('  ❌ Failed to disconnect catalog from WABA');
      console.log('  Attempting to continue with deletion anyway...');
    }
    console.log('');
  }

  // Step 4: Delete the catalog
  console.log('📋 Step 4: Deleting catalog...');
  const deleted = await deleteCatalog(catalogId);

  if (deleted) {
    console.log('  ✅ Successfully deleted catalog!');
  } else {
    console.log('  ❌ Failed to delete catalog');
  }
  console.log('');

  // Final status
  console.log('========================================');
  console.log('Summary:');
  console.log(`  - Disconnected from WABA: ${isConnected ? 'Yes' : 'N/A'}`);
  console.log(`  - Catalog deleted: ${deleted ? 'Yes' : 'No'}`);
  console.log('========================================');
}

main().catch((error) => {
  console.error('Script failed:', error);
  process.exit(1);
});
