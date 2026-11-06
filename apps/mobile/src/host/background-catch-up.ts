import type { CatchUpHost } from './catch-up';

export const CATCH_UP_TASK = 'botharness-catch-up';
export const BACKGROUND_PAGES = 2;
export const BACKGROUND_INTERVAL_MINUTES = 15;
const DEADLINE_MS = 25_000;

type Call = CatchUpHost['call'];

export const BACKGROUND_NATIVE_MODULES = ['ExpoTaskManager', 'ExpoBackgroundTask'] as const;

export function loadWithNativeModules<T>(
  available: (name: string) => boolean,
  names: readonly string[],
  load: () => T,
): T | undefined {
  return names.every(available) ? load() : undefined;
}

export type BackgroundCatchUpResult = 'synced' | 'skipped' | 'failed';

export interface BackgroundCatchUpOptions<Saved extends { hostId: string; routes: string[] }> {
  hosts(): Promise<readonly Saved[]>;
  call(saved: Saved, route: string): Call;
  refused(error: unknown): boolean;
  liveKeys(hostId: string): readonly string[];
  sync(host: CatchUpHost): Promise<void>;
  constrained(): Promise<boolean>;
  deadlineMs?: number;
}

async function reachable<Saved extends { hostId: string; routes: string[] }>(
  options: BackgroundCatchUpOptions<Saved>,
  saved: Saved,
): Promise<Call | undefined> {
  for (const route of saved.routes) {
    try {
      const call = options.call(saved, route);
      await call('channelChangeCursor', {});
      return call;
    } catch (error) {
      if (options.refused(error)) return undefined;
    }
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
  const work = Promise.all(
    hosts.map(async (saved) => {
      try {
        const call = await reachable(options, saved);
        if (call === undefined) return;
        await options.sync({
          hostId: saved.hostId,
          call,
          liveKeys: () => options.liveKeys(saved.hostId),
        });
      } catch {}
    }),
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<'late'>((resolve) => {
    timer = setTimeout(() => resolve('late'), options.deadlineMs ?? DEADLINE_MS);
  });
  try {
    const finished = await Promise.race([work.then(() => 'done' as const), deadline]);
    return finished === 'done' ? 'synced' : 'failed';
  } finally {
    clearTimeout(timer);
  }
}
