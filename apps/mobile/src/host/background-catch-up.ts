import type { CatchUpHost } from './catch-up';

export const CATCH_UP_TASK = 'botharness-catch-up';
export const BACKGROUND_PAGES = 2;
export const BACKGROUND_INTERVAL_MINUTES = 15;
const DEADLINE_MS = 25_000;

type Call = CatchUpHost['call'];

export type BackgroundCatchUpResult = 'synced' | 'skipped' | 'failed';

export interface BackgroundCatchUpOptions<Saved extends { hostId: string; routes: string[] }> {
  hosts(): Promise<readonly Saved[]>;
  call(saved: Saved, route: string): Call;
  sync(host: CatchUpHost): Promise<void>;
  constrained(): Promise<boolean>;
  deadlineMs?: number;
}

async function reachable<Saved extends { hostId: string; routes: string[] }>(
  options: BackgroundCatchUpOptions<Saved>,
  saved: Saved,
): Promise<Call | undefined> {
  for (const route of saved.routes) {
    const call = options.call(saved, route);
    try {
      await call('channelChangeCursor', {});
      return call;
    } catch {}
  }
  return undefined;
}

export async function runBackgroundCatchUp<Saved extends { hostId: string; routes: string[] }>(
  options: BackgroundCatchUpOptions<Saved>,
): Promise<BackgroundCatchUpResult> {
  if (await options.constrained().catch(() => false)) return 'skipped';
  let hosts: readonly Saved[];
  try {
    hosts = await options.hosts();
  } catch {
    return 'failed';
  }
  const work = (async () => {
    for (const saved of hosts) {
      const call = await reachable(options, saved);
      if (call === undefined) continue;
      await options.sync({ hostId: saved.hostId, call, liveKeys: () => [] }).catch(() => undefined);
    }
  })();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<'late'>((resolve) => {
    timer = setTimeout(() => resolve('late'), options.deadlineMs ?? DEADLINE_MS);
  });
  const finished = await Promise.race([work.then(() => 'done' as const), deadline]);
  clearTimeout(timer);
  return finished === 'done' ? 'synced' : 'failed';
}
