#!/usr/bin/env ts-node
/**
 * Debug script to test template status sync with Meta API
 *
 * This script:
 * 1. Lists all templates in the database with pending status
 * 2. Fetches the actual status from Meta API
 * 3. Compares and shows discrepancies
 *
 * Usage: npx ts-node scripts/debug-template-status.ts
 */

import 'dotenv/config';
import { isNotNull } from 'drizzle-orm';
import { db } from '../src/database/db.connection';
import { templateLocales } from '../src/database/schema';

const META_API_VERSION = 'v21.0';
const META_BASE_URL = 'https://graph.facebook.com';

interface MetaStatusResponse {
  id: string;
  status: string;
  quality_score?: {
    score: string;
    date: number;
  };
  rejected_reason?: string;
  category?: string;
  error?: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

async function getMetaTemplateStatus(
  templateId: string,
  accessToken: string,
): Promise<MetaStatusResponse> {
  const url = `${META_BASE_URL}/${META_API_VERSION}/${templateId}?fields=id,status,quality_score,rejected_reason,category`;

  console.log(`  📡 Calling: GET ${url}`);

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data = await response.json();
  return data;
}

async function main() {
  console.log('🔍 Debug Template Status Sync');
  console.log('='.repeat(60));

  const accessToken = process.env.META_ACCESS_TOKEN;

  if (!accessToken) {
    console.error('❌ META_ACCESS_TOKEN not set in environment');
    process.exit(1);
  }

  console.log(`✅ Access token found: ${accessToken.substring(0, 20)}...`);

  // 1. Get all template locales with pending status or with a metaTemplateId
  console.log('\n📋 Fetching templates from database...');

  const localesWithMeta = await db.query.templateLocales.findMany({
    where: isNotNull(templateLocales.metaTemplateId),
    with: {
      template: true,
      versions: {
        orderBy: (v, { desc }) => [desc(v.versionNumber)],
        limit: 1,
      },
    },
  });

  console.log(`Found ${localesWithMeta.length} template locales with Meta IDs`);

  if (localesWithMeta.length === 0) {
    console.log('\nNo templates with Meta IDs found. Nothing to debug.');
    process.exit(0);
  }

  console.log('\n' + '='.repeat(60));

  for (const locale of localesWithMeta) {
    console.log(`\n📦 Template: ${locale.template?.name || 'Unknown'}`);
    console.log(`   Locale: ${locale.locale}`);
    console.log(`   MetaTemplateId: ${locale.metaTemplateId || 'NOT SET'}`);
    console.log(
      `   DB approvalStatus (template_locales): ${locale.approvalStatus}`,
    );

    // Check version status
    const latestVersion = locale.versions?.[0];
    if (latestVersion) {
      console.log(
        `   DB version status (template_versions): ${latestVersion.status}`,
      );
      console.log(
        `   Version providerId: ${latestVersion.providerId || 'NOT SET'}`,
      );

      // Check for mismatch
      if (locale.metaTemplateId !== latestVersion.providerId) {
        console.log(`   ⚠️  MISMATCH: metaTemplateId !== providerId`);
      }
    } else {
      console.log(`   No versions found for this locale`);
    }

    // Fetch from Meta API if we have an ID
    if (locale.metaTemplateId) {
      console.log('\n   Fetching status from Meta API...');

      try {
        const metaResponse = await getMetaTemplateStatus(
          locale.metaTemplateId,
          accessToken,
        );

        console.log(`   Meta API Response:`);
        console.log(`     ID: ${metaResponse.id}`);
        console.log(`     Status: ${metaResponse.status}`);
        console.log(`     Category: ${metaResponse.category || 'N/A'}`);
        console.log(
          `     Quality Score: ${metaResponse.quality_score?.score || 'N/A'}`,
        );
        console.log(
          `     Rejected Reason: ${metaResponse.rejected_reason || 'N/A'}`,
        );

        if (metaResponse.error) {
          console.log(`   ❌ Error from Meta:`);
          console.log(`      Message: ${metaResponse.error.message}`);
          console.log(`      Code: ${metaResponse.error.code}`);
          console.log(`      Type: ${metaResponse.error.type}`);
        }

        // Compare statuses
        const metaStatus = metaResponse.status?.toLowerCase();
        const dbStatus = locale.approvalStatus?.toLowerCase();

        if (metaStatus && dbStatus && metaStatus !== dbStatus) {
          console.log(`\n   🔴 STATUS MISMATCH DETECTED!`);
          console.log(`      DB says: ${dbStatus}`);
          console.log(`      Meta says: ${metaStatus}`);
        } else if (metaStatus && dbStatus && metaStatus === dbStatus) {
          console.log(`\n   ✅ Status in sync: ${metaStatus}`);
        }
      } catch (error) {
        console.log(`   ❌ Failed to fetch from Meta: ${error.message}`);
      }

      // Rate limit protection
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    console.log('-'.repeat(60));
  }

  console.log('\n📊 Analysis Complete\n');

  // Summary
  console.log('Schema Status:');
  console.log('--------------');
  console.log(
    '✅ template_locales.approvalStatus is the SOURCE OF TRUTH for current status',
  );
  console.log(
    '✅ template_locales.metaTemplateId is the SOURCE OF TRUTH for Meta template ID',
  );
  console.log(
    'ℹ️  template_versions.status tracks historical submission state',
  );
  console.log(
    'ℹ️  template_versions.providerId is DEPRECATED (backward compatibility only)',
  );

  process.exit(0);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
