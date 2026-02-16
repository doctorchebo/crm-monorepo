import 'dotenv/config';
import { db } from './src/database/db.connection';
import { templateLocales } from './src/database/schema';
import { isNotNull, eq } from 'drizzle-orm';

const META_STATUS_MAP = {
  APPROVED: 'approved',
  PENDING: 'pending',
  REJECTED: 'rejected',
  PAUSED: 'paused',
  DISABLED: 'disabled',
};

async function syncAll() {
  const accessToken = process.env.META_ACCESS_TOKEN;
  const locales = await db.query.templateLocales.findMany({
    where: isNotNull(templateLocales.metaTemplateId),
    with: { template: true }
  });

  console.log('Syncing ' + locales.length + ' templates...');

  for (const loc of locales) {
    const url = 'https://graph.facebook.com/v21.0/' + loc.metaTemplateId + '?fields=id,status,category';
    const res = await fetch(url, { headers: { Authorization: 'Bearer ' + accessToken } });
    const data = await res.json();

    if (data.error) {
      console.log('ERROR ' + loc.template?.name + ': ' + data.error.message.substring(0,50));
      if (data.error.code === 100) {
        await db.update(templateLocales).set({ approvalStatus: 'disabled' }).where(eq(templateLocales.id, loc.id));
      }
      continue;
    }

    const newStatus = META_STATUS_MAP[data.status] || 'draft';
    if (loc.approvalStatus !== newStatus) {
      await db.update(templateLocales).set({ approvalStatus: newStatus, category: data.category?.toLowerCase() }).where(eq(templateLocales.id, loc.id));
      console.log('UPDATED ' + loc.template?.name + ': ' + loc.approvalStatus + ' -> ' + newStatus);
    } else {
      console.log('OK ' + loc.template?.name + ': ' + newStatus);
    }
    await new Promise(r => setTimeout(r, 200));
  }
  console.log('Done!');
  process.exit(0);
}
syncAll();
