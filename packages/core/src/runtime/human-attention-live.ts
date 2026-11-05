import {
  attachOperationalModule,
  onOperationalDatabaseClose,
  type OperationalDatabaseOwner,
} from '../database/owner.js';
import { coalesce } from './coalesce.js';

const TOPICS = new Set([
  'source-event',
  'channel',
  'human-attention',
  'bot-inbox',
  'assignments',
  'grants',
  'bot-registry',
  'roster',
  'content-purge',
  'pairing',
]);

export function watchHumanAttention(
  database: OperationalDatabaseOwner,
  watchRequests: (changed: () => void) => () => void,
  changed: () => void,
): () => void {
  if (database.mode !== 'ready') return () => {};
  const port = attachOperationalModule(database, 'human-attention');
  let stopped = false;
  let expiry: ReturnType<typeof setTimeout> | undefined;
  const armExpiry = (): void => {
    clearTimeout(expiry);
    const now = new Date().toISOString();
    const row = port.read((db) =>
      db.prepare('SELECT min(until) AS next FROM human_inbox_snoozes WHERE until > ?').get(now),
    ) as { next: string | null };
    if (row.next === null) return;
    expiry = setTimeout(
      invalidate,
      Math.max(1, Math.min(2_147_483_647, Date.parse(row.next) - Date.now())),
    );
    expiry.unref?.();
  };
  const queued = coalesce(
    () => {
      if (stopped || database.mode !== 'ready') return;
      armExpiry();
      changed();
    },
    { delayMs: 150, maxWaitMs: 1_000 },
  );
  const invalidate = (): void => {
    if (!stopped) queued.schedule();
  };
  const offDatabase = database.subscribe(({ topics }) => {
    if (topics.some((topic) => TOPICS.has(topic))) invalidate();
  });
  const offRequests = watchRequests(invalidate);
  armExpiry();
  const cleanup = () => {
    if (stopped) return;
    stopped = true;
    queued.cancel();
    clearTimeout(expiry);
    offDatabase();
    offRequests();
  };
  onOperationalDatabaseClose(database, cleanup);
  return cleanup;
}
