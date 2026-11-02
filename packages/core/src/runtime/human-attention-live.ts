import {
  attachOperationalModule,
  onOperationalDatabaseClose,
  type OperationalDatabaseOwner,
} from '../database/owner.js';

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
]);

export function watchHumanAttention(
  database: OperationalDatabaseOwner,
  watchRequests: (changed: () => void) => () => void,
  changed: () => void,
): () => void {
  if (database.mode !== 'ready') return () => {};
  const port = attachOperationalModule(database, 'human-attention');
  let stopped = false;
  let queued: ReturnType<typeof setTimeout> | undefined;
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
  const invalidate = (): void => {
    if (stopped || queued !== undefined) return;
    queued = setTimeout(() => {
      queued = undefined;
      if (stopped || database.mode !== 'ready') return;
      armExpiry();
      changed();
    }, 0);
    queued.unref?.();
  };
  const offDatabase = database.subscribe(({ topics }) => {
    if (topics.some((topic) => TOPICS.has(topic))) invalidate();
  });
  const offRequests = watchRequests(invalidate);
  armExpiry();
  const cleanup = () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(queued);
    clearTimeout(expiry);
    offDatabase();
    offRequests();
  };
  onOperationalDatabaseClose(database, cleanup);
  return cleanup;
}
