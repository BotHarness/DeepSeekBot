import type { OperationalDatabaseModulePort } from '../database/owner.js';

export type AcknowledgementKey =
  | 'bot-mode-entered'
  | 'onboarding-intro'
  | 'telemetry-notice'
  | 'release-notes-seen'
  | `release-update-dismissed/${string}`;

export interface ClientAcknowledgements {
  list(): Record<string, string>;
  record(key: string, value: string): { key: string; value: string } | undefined;
}

const FIXED_KEYS = new Set(['bot-mode-entered', 'onboarding-intro', 'telemetry-notice']);
const RELEASE_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const UPDATE_KEY =
  /^release-update-dismissed\/(?:preview|stable)\/(?:restart-)?[0-9A-Za-z.+-]{1,80}$/;

export function isAcknowledgementKey(key: unknown): key is AcknowledgementKey {
  return (
    typeof key === 'string' &&
    (FIXED_KEYS.has(key) || key === 'release-notes-seen' || UPDATE_KEY.test(key))
  );
}

export function acknowledgementValue(key: AcknowledgementKey, value: unknown): string | undefined {
  if (key === 'release-notes-seen')
    return typeof value === 'string' && value.length <= 80 && RELEASE_VERSION.test(value)
      ? value
      : undefined;
  return value === undefined || value === '1' ? '1' : undefined;
}

export function createClientAcknowledgements(options: {
  database: OperationalDatabaseModulePort;
  now?: () => Date;
}): ClientAcknowledgements {
  const { database } = options;
  const now = options.now ?? (() => new Date());
  return {
    list() {
      const rows = database.read((db) =>
        db.prepare('SELECT ack_key, value FROM client_acknowledgements ORDER BY ack_key').all(),
      ) as Array<{ ack_key: string; value: string }>;
      return Object.fromEntries(rows.map((row) => [row.ack_key, row.value]));
    },
    record(key, value) {
      if (!isAcknowledgementKey(key)) return undefined;
      const stored = acknowledgementValue(key, value);
      if (stored === undefined) return undefined;
      database.transaction((db) =>
        db
          .prepare(
            `INSERT INTO client_acknowledgements (ack_key, value, recorded_at) VALUES (?, ?, ?)
             ON CONFLICT(ack_key) DO UPDATE SET value = excluded.value, recorded_at = excluded.recorded_at`,
          )
          .run(key, stored, now().toISOString()),
      );
      return { key, value: stored };
    },
  };
}
