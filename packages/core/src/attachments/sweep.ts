import type { OperationalDatabaseOwner } from '../database/owner.js';
import { attachOperationalModule } from '../database/owner.js';
import { collectAttachmentReferences } from './backup.js';
import type { AttachmentStore } from './store.js';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
export const ATTACHMENT_SWEEP_INTERVAL_MS = DAY_MS;
export const STAGED_UPLOAD_GRACE_MS = DAY_MS;
export const UNREFERENCED_ATTACHMENT_GRACE_MS = 30 * DAY_MS;
const FIRST_SWEEP_DELAY_MS = 10 * 60 * 1000;

export interface AttachmentSweepResult {
  staged: number;
  unreferenced: number;
}

export async function sweepAttachments(options: {
  attachments: AttachmentStore;
  database: OperationalDatabaseOwner;
  channelReferences: () => Iterable<string>;
  memoryReferences: () => Iterable<string>;
  now?: Date;
}): Promise<AttachmentSweepResult> {
  const now = (options.now ?? new Date()).getTime();
  const staged = await options.attachments.sweepStaged(new Date(now - STAGED_UPLOAD_GRACE_MS));
  if (options.database.mode !== 'ready') return { staged, unreferenced: 0 };
  const port = attachOperationalModule(options.database, 'attachments');
  const unreferenced = options.attachments.sweepUnreferenced(
    new Date(now - UNREFERENCED_ATTACHMENT_GRACE_MS),
    () => {
      const required = new Set([...options.channelReferences(), ...options.memoryReferences()]);
      const retained = port.read((db) => collectAttachmentReferences(db, required));
      return new Set([...required, ...retained]);
    },
  );
  return { staged, unreferenced };
}

export function startAttachmentSweep(options: {
  attachments: AttachmentStore;
  database: OperationalDatabaseOwner;
  channelReferences: () => Iterable<string>;
  memoryReferences: () => Iterable<string>;
  log?: (message: string) => void;
  firstDelayMs?: number;
  intervalMs?: number;
}): () => void {
  let running = false;
  const tick = (): void => {
    if (running) return;
    running = true;
    const started = Date.now();
    void sweepAttachments(options)
      .then(({ staged, unreferenced }) =>
        options.log?.(
          `attachment-sweep phase=done staged=${staged} unreferenced=${unreferenced} durationMs=${Date.now() - started}`,
        ),
      )
      .catch((error: unknown) =>
        options.log?.(
          `attachment-sweep phase=skipped reason=${error instanceof Error ? error.name : 'unknown'}`,
        ),
      )
      .finally(() => {
        running = false;
      });
  };
  let timer: ReturnType<typeof setInterval> | undefined;
  const first = setTimeout(() => {
    tick();
    timer = setInterval(tick, options.intervalMs ?? ATTACHMENT_SWEEP_INTERVAL_MS);
    timer.unref?.();
  }, options.firstDelayMs ?? FIRST_SWEEP_DELAY_MS);
  first.unref?.();
  return () => {
    clearTimeout(first);
    if (timer !== undefined) clearInterval(timer);
  };
}
