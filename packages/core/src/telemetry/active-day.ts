import type { OperationalDatabaseModulePort } from '../database/owner.js';
import type { TelemetrySurface } from './events.js';
import { readActiveDay, writeActiveDay, type TelemetryService } from './service.js';

const CHECK_INTERVAL_MS = 60 * 60 * 1000;

export type ActiveDayTrigger = 'bot_mode_enter' | 'message' | 'im_message';

export interface ActiveDay {
  mark(trigger: ActiveDayTrigger, surface?: TelemetrySurface): void;
}

export interface HumanMessageCounts {
  human: number;
  im: number;
}

export function localDay(at: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

function localMidnight(at: Date): Date {
  return new Date(at.getFullYear(), at.getMonth(), at.getDate());
}

export function createActiveDay(options: {
  telemetry: Pick<TelemetryService, 'enabled' | 'capture'>;
  dataDir: string;
  now?: () => Date;
}): ActiveDay {
  const now = options.now ?? (() => new Date());
  let marked: string | undefined;
  return {
    mark(trigger, surface) {
      if (!options.telemetry.enabled) return;
      try {
        const day = localDay(now());
        if (marked === day) return;
        marked = day;
        if (readActiveDay(options.dataDir) === day) return;
        options.telemetry.capture('app:active_day_start', {
          trigger,
          ...(surface === undefined ? {} : { surface }),
        });
        writeActiveDay(options.dataDir, day);
      } catch {
        return;
      }
    },
  };
}

export function readHumanMessageCounts(
  database: OperationalDatabaseModulePort,
  since: Date,
): HumanMessageCounts {
  const from = since.toISOString();
  return database.read((db) => {
    const count = (kind: string): number => {
      const value = Number(
        db
          .prepare(
            'SELECT COUNT(*) AS n FROM source_events WHERE source_kind = ? AND created_at >= ?',
          )
          .get(kind, from)?.['n'],
      );
      return Number.isFinite(value) && value > 0 ? value : 0;
    };
    return { human: count('human-message'), im: count('bridge-message') };
  });
}

export function startActiveDayWatch(options: {
  activeDay: ActiveDay;
  counts: (since: Date) => HumanMessageCounts;
  now?: () => Date;
  intervalMs?: number;
  log?: (message: string) => void;
}): () => void {
  const now = options.now ?? (() => new Date());
  const tick = (): void => {
    try {
      const counts = options.counts(localMidnight(now()));
      if (counts.human > 0) options.activeDay.mark('message');
      else if (counts.im > 0) options.activeDay.mark('im_message', 'im');
    } catch {
      options.log?.('telemetry phase=active-day-skipped');
    }
  };
  tick();
  const timer = setInterval(tick, options.intervalMs ?? CHECK_INTERVAL_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}
