import cron from 'node-cron';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { runCustomerDataSourceSync } from './customer-master-sync-service.js';

let started = false;
const jobs = new Map<string, ReturnType<typeof cron.schedule>>();
const running = new Set<string>();

export async function reloadCustomerDataSourceCron(): Promise<void> {
  for (const job of jobs.values()) job.stop();
  jobs.clear();

  const sources = await prisma.customerDataSource.findMany({
    where: {
      enabled: true,
      syncMode: 'scheduled',
      scheduleCron: { not: null },
      dataType: 'customer_master',
      provider: 'google_sheet',
      archivedAt: null,
    },
    select: { id: true, orgId: true, name: true, scheduleCron: true },
  });

  for (const source of sources) {
    const expression = source.scheduleCron || '';
    if (!cron.validate(expression)) {
      logger.warn(`[customer-sync-cron] invalid cron source=${source.id} name=${source.name} cron=${expression}`);
      continue;
    }
    const job = cron.schedule(expression, async () => {
      if (running.has(source.id)) return;
      running.add(source.id);
      try {
        const result = await runCustomerDataSourceSync({
          sourceId: source.id,
          orgId: source.orgId,
          triggerType: 'scheduled',
        });
        logger.info(`[customer-sync-cron] source=${source.id} created=${result.createdCount} updated=${result.updatedCount} errors=${result.errorCount}`);
      } catch (error) {
        logger.error(`[customer-sync-cron] source=${source.id} failed`, error);
      } finally {
        running.delete(source.id);
      }
    });
    jobs.set(source.id, job);
  }

  logger.info(`[customer-sync-cron] registered ${jobs.size} scheduled customer data source(s)`);
}

export function startCustomerMasterCron(): void {
  if (started) return;
  started = true;
  reloadCustomerDataSourceCron().catch((error) => {
    logger.error('[customer-sync-cron] boot failed', error);
  });
}
