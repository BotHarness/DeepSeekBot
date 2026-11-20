import { ATTACHMENT_FILE_ID_PATTERN } from './ref.js';
import type { MediaVersions } from './media-versions.js';

const FIRST_BACKFILL_DELAY_MS = 2 * 60 * 1000;
const BACKFILL_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const BACKFILL_DUTY = 0.2;

export interface MediaBackfillResult {
  checked: number;
  computed: number;
  failed: number;
  stopped: boolean;
}

export async function backfillMediaVersions(options: {
  fileIds: () => Iterable<string>;
  versions: Pick<MediaVersions, 'known' | 'ensure'>;
  signal?: AbortSignal;
  duty?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}): Promise<MediaBackfillResult> {
  const duty = options.duty ?? BACKFILL_DUTY;
  const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? (() => performance.now());
  const result: MediaBackfillResult = { checked: 0, computed: 0, failed: 0, stopped: false };
  const seen = new Set<string>();
  for (const fileId of options.fileIds()) {
    if (options.signal?.aborted) {
      result.stopped = true;
      return result;
    }
    if (seen.has(fileId) || !ATTACHMENT_FILE_ID_PATTERN.test(fileId)) continue;
    seen.add(fileId);
    result.checked += 1;
    if (options.versions.known(fileId)) continue;
    const started = now();
    try {
      if ((await options.versions.ensure(fileId)) === undefined) result.failed += 1;
      else result.computed += 1;
    } catch {
      result.failed += 1;
    }
    const busy = now() - started;
    await sleep(Math.max(1, (busy * (1 - duty)) / duty));
  }
  return result;
}

export function startMediaBackfill(options: {
  fileIds: () => Iterable<string>;
  versions: Pick<MediaVersions, 'known' | 'ensure'>;
  log?: (message: string) => void;
  firstDelayMs?: number;
  intervalMs?: number;
}): () => void {
  const controller = new AbortController();
  let running = false;
  const tick = (): void => {
    if (running) return;
    running = true;
    const started = Date.now();
    void backfillMediaVersions({ ...options, signal: controller.signal })
      .then(({ checked, computed, failed, stopped }) => {
        if (computed > 0 || failed > 0 || stopped)
          options.log?.(
            `media-backfill phase=${stopped ? 'stopped' : 'done'} checked=${checked} computed=${computed} failed=${failed} durationMs=${Date.now() - started}`,
          );
      })
      .catch((error: unknown) =>
        options.log?.(
          `media-backfill phase=skipped reason=${error instanceof Error ? error.name : 'unknown'}`,
        ),
      )
      .finally(() => {
        running = false;
      });
  };
  let timer: ReturnType<typeof setInterval> | undefined;
  const first = setTimeout(() => {
    tick();
    timer = setInterval(tick, options.intervalMs ?? BACKFILL_INTERVAL_MS);
    timer.unref?.();
  }, options.firstDelayMs ?? FIRST_BACKFILL_DELAY_MS);
  first.unref?.();
  return () => {
    controller.abort();
    clearTimeout(first);
    if (timer !== undefined) clearInterval(timer);
  };
}
