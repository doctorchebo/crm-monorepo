#!/usr/bin/env ts-node
/**
 * Sync all template statuses from Meta API
 *
 * This script fetches the current status from Meta for all templates
 * with a metaTemplateId and updates the database.
 *
 * Usage: npx ts-node scripts/sync-all-templates.ts
 */

import 'dotenv/config';
import { eq, isNotNull } from 'drizzle-orm';
import { db } from '../src/database/db.connection';
import { templateLocales } from '../src/database/schema';

const META_API_VERSION = 'v21.0';
const META_BASE_URL = 'https://graph.facebook.com';

const META_STATUS_MAP: Record<string, string> = {
  APPROVED: 'approved',
  PENDING: 'pending',
  IN_REVIEW: 'pending',
  REJECTED: 'rejected',
  PAUSED: 'paused',
  FLAGGED: 'paused',
  DISABLED: 'disabled',
  IN_APPEAL: 'appeal_requested',
  REINSTATED: 'approved',
  PENDING_DELETION: 'disabled',
  DELETED: 'disabled',
};

interface MetaResponse {
  id?: string;
  status?: string;
  category?: string;
  quality_score?: { score: string };
  error?: {
    message: string;
    code: number;
  };
}

async function syncTemplates() {
  console.log('🔄 Template Status Sync Tool');
  console.log('='.repeat(50));

  const accessToken = process.env.META_ACCESS_TOKEN;
  if (!accessToken) {
    console.error('❌ META_ACCESS_TOKEN not set in environment');
    process.exit(1);
  }

  console.log(`✅ Access token found`);

  // Fetch all templates with Meta IDs
  const locales = await db.query.templateLocales.findMany({
    where: isNotNull(templateLocales.metaTemplateId),
    with: { template: true },
  });

  console.log(`📋 Found ${locales.length} templates to sync\n`);

  let updated = 0;
  let errors = 0;
  let unchanged = 0;

  for (const loc of locales) {
    const templateName = loc.template?.name || 'Unknown';
    const url = `${META_BASE_URL}/${META_API_VERSION}/${loc.metaTemplateId}?fields=id,status,category,quality_score`;

    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data: MetaResponse = await res.json();

      if (data.error) {
        console.log(
          `❌ ${templateName} (${loc.locale}): ${data.error.message.substring(0, 60)}...`,
        );

        // Mark as disabled if template doesn't exist on Meta anymore
        if (data.error.code === 100) {
          await db
            .update(templateLocales)
            .set({
              approvalStatus: 'disabled',
              updatedAt: new Date(),
            })
            .where(eq(templateLocales.id, loc.id));
          console.log(`   → Marked as disabled (deleted from Meta)`);
          updated++;
        } else {
          errors++;
        }
        continue;
      }

      const newStatus = META_STATUS_MAP[data.status || ''] || 'draft';
      const statusChanged = loc.approvalStatus !== newStatus;

      if (statusChanged) {
        await db
          .update(templateLocales)
          .set({
            approvalStatus: newStatus,
            category: data.category?.toLowerCase() || loc.category,
            updatedAt: new Date(),
            reviewedAt: newStatus !== 'pending' ? new Date() : loc.reviewedAt,
          })
          .where(eq(templateLocales.id, loc.id));

        console.log(
          `✅ ${templateName} (${loc.locale}): ${loc.approvalStatus} → ${newStatus}`,
        );
        updated++;
      } else {
        console.log(
          `⏸️  ${templateName} (${loc.locale}): already ${newStatus}`,
        );
        unchanged++;
      }

      // Rate limit protection
      await new Promise((resolve) => setTimeout(resolve, 200));
    } catch (err) {
      console.log(
        `❌ ${templateName} (${loc.locale}): ${(err as Error).message}`,
      );
      errors++;
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log(`📊 Summary:`);
  console.log(`   Updated: ${updated}`);
  console.log(`   Unchanged: ${unchanged}`);
  console.log(`   Errors: ${errors}`);
  console.log('\n✅ Sync complete!');

  process.exit(0);
}

syncTemplates().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
