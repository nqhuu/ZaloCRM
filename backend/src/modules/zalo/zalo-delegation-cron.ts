import { logger } from '../../shared/utils/logger.js';
import { reconcileExpiredPrimaryDelegationAccess } from './zalo-assignment-service.js';

let timer: ReturnType<typeof setInterval> | null = null;

export function startZaloDelegationCron(intervalMs = 60 * 60 * 1000) {
  if (timer) return;

  async function tick() {
    try {
      const result = await reconcileExpiredPrimaryDelegationAccess();
      if (result.granted || result.revoked || result.restored) {
        logger.info(
          `[zalo-delegation] temporary access reconciled: checked=${result.checked} granted=${result.granted} revoked=${result.revoked} restored=${result.restored}`,
        );
      }
    } catch (error) {
      logger.error('[zalo-delegation] reconcile failed:', error);
    }
  }

  void tick();
  timer = setInterval(() => void tick(), intervalMs);
}
