import type { OperationalDatabaseModulePort } from '../database/owner.js';

export const PUSH_KINDS = ['approval', 'question', 'private-input', 'reply'] as const;
export type PushKind = (typeof PUSH_KINDS)[number];
export type PushPreferences = Record<PushKind, boolean>;
export type PushPlatform = 'ios' | 'android';
export type PushLocale = 'en' | 'zh';

export const DEFAULT_PUSH_PREFERENCES: PushPreferences = {
  approval: true,
  question: true,
  'private-input': true,
  reply: true,
};

const MAX_ATTEMPTS = 3;
const RETRY_BASE_MS = 1_000;
const RECEIPT_DELAY_MS = 15 * 60 * 1000;
const MAX_PENDING_RECEIPTS = 1_000;
const BATCH = 100;
const TOKEN = /^Expo(?:nent)?PushToken\[[A-Za-z0-9_-]{8,128}\]$/u;

export interface PushCandidate {
  id: string;
  kind: PushKind;
  attentionKind: string;
  botSlug: string;
  createdAt: string;
  channelId?: string;
  messageId?: string;
  channelName?: string;
  preview?: string;
}

export interface PushSource {
  pending(): { items: PushCandidate[]; badge: number };
  botName(slug: string): string | undefined;
}

export interface PushData {
  v: 1;
  hostId: string;
  itemId?: string;
  kind?: string;
  botSlug?: string;
  channelId?: string;
  messageId?: string;
  test?: true;
}

export interface ExpoMessage {
  to: string;
  title?: string;
  body?: string;
  sound?: 'default';
  badge: number;
  data: PushData;
  priority?: 'high';
  channelId?: string;
  categoryId?: string;
}

export type ExpoTicket =
  | { status: 'ok'; id: string }
  | { status: 'error'; message?: string; details?: { error?: string } };

export type ExpoReceipt =
  | { status: 'ok' }
  | { status: 'error'; message?: string; details?: { error?: string } };

export class PushSendError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

export interface ExpoSender {
  send(messages: ExpoMessage[]): Promise<ExpoTicket[]>;
  receipts(ids: string[]): Promise<Record<string, ExpoReceipt>>;
}

export type PushEvent =
  | { phase: 'registered' | 'unregistered' | 'preferences'; deviceId: string }
  | {
      phase: 'sent';
      deviceId: string;
      kind: PushKind | 'badge' | 'test';
      outcome: 'ok' | 'error';
      code?: string;
    }
  | { phase: 'retry'; deviceId: string; attempt: number; code: string }
  | { phase: 'send-failed'; deviceId: string; count: number; code: string }
  | { phase: 'token-dropped'; deviceId: string; code: 'device-revoked' | 'device-not-registered' };

export type RegisterResult = { ok: true } | { ok: false; code: 'push-token-invalid' };
export type TestResult = 'sent' | 'not-registered' | 'failed';

export interface PushSettings {
  registered: boolean;
  preferences: PushPreferences;
}

export interface PushDelivery {
  register(
    deviceId: string,
    input: { token: unknown; platform: unknown; locale?: unknown },
  ): RegisterResult;
  unregister(deviceId: string): boolean;
  settings(deviceId: string): PushSettings;
  setPreferences(deviceId: string, input: unknown): PushSettings;
  test(deviceId: string): Promise<TestResult>;
  reconcile(): Promise<void>;
  checkReceipts(): Promise<void>;
}

export interface PushDeliveryOptions {
  database: OperationalDatabaseModulePort;
  source: PushSource;
  sender: ExpoSender;
  host(): { id: string; name: string };
  deviceActive(deviceId: string): boolean;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  record?: (event: PushEvent) => void;
}

interface DeviceRow {
  device_id: string;
  token: string;
  platform: PushPlatform;
  preferences_json: string;
  registered_at: string;
  locale: string | null;
  badge: number | null;
}

function preferencesOf(json: string | undefined): PushPreferences {
  let value: Record<string, unknown> = {};
  try {
    value = JSON.parse(json ?? '{}') as Record<string, unknown>;
  } catch {}
  return Object.fromEntries(
    PUSH_KINDS.map((kind) => [
      kind,
      typeof value[kind] === 'boolean' ? value[kind] : DEFAULT_PUSH_PREFERENCES[kind],
    ]),
  ) as PushPreferences;
}

const TITLES: Record<PushLocale, Record<PushKind | 'channel-mention', (bot: string) => string>> = {
  en: {
    approval: (bot) => `${bot} needs your approval`,
    question: (bot) => `${bot} has a question for you`,
    'private-input': (bot) => `${bot} needs private input from you`,
    reply: (bot) => `${bot} replied to you`,
    'channel-mention': (bot) => `${bot} mentioned you`,
  },
  zh: {
    approval: (bot) => `${bot} 需要你审批`,
    question: (bot) => `${bot} 有问题问你`,
    'private-input': (bot) => `${bot} 需要你提供私密输入`,
    reply: (bot) => `${bot} 回复了你`,
    'channel-mention': (bot) => `${bot} 提到了你`,
  },
};

const LEADS: Record<
  PushLocale,
  Record<PushKind | 'channel-mention', (bot: string | undefined) => string>
> = {
  en: {
    approval: (bot) => (bot === undefined ? 'Needs your approval' : `${bot} needs your approval`),
    question: (bot) =>
      bot === undefined ? 'Has a question for you' : `${bot} has a question for you`,
    'private-input': (bot) =>
      bot === undefined ? 'Needs private input from you' : `${bot} needs private input from you`,
    reply: (bot) => bot ?? '',
    'channel-mention': (bot) => bot ?? '',
  },
  zh: {
    approval: (bot) => (bot === undefined ? '需要你审批' : `${bot} 需要你审批`),
    question: (bot) => (bot === undefined ? '有问题问你' : `${bot} 有问题问你`),
    'private-input': (bot) =>
      bot === undefined ? '需要你提供私密输入' : `${bot} 需要你提供私密输入`,
    reply: (bot) => bot ?? '',
    'channel-mention': (bot) => bot ?? '',
  },
};

const SEPARATOR: Record<PushLocale, string> = { en: ': ', zh: '：' };

const TEST: Record<PushLocale, { title: string; body: (host: string) => string }> = {
  en: { title: 'Notifications are on', body: (host) => `Sent from ${host}.` },
  zh: { title: '通知已开启', body: (host) => `来自 ${host}。` },
};

function localeOf(value: unknown): PushLocale {
  return value === 'zh' ? 'zh' : 'en';
}

function text(
  candidate: PushCandidate,
  bot: string,
  locale: PushLocale,
): { title: string; body: string } {
  const key = candidate.attentionKind === 'channel-mention' ? 'channel-mention' : candidate.kind;
  const lead = LEADS[locale][key](candidate.channelName === undefined ? undefined : bot);
  const body =
    candidate.preview === undefined
      ? lead
      : lead === ''
        ? candidate.preview
        : `${lead}${SEPARATOR[locale]}${candidate.preview}`;
  return {
    title: candidate.channelName === undefined ? bot : `#${candidate.channelName}`,
    body: body === '' ? TITLES[locale][key](bot) : body,
  };
}

export function createPushDelivery(options: PushDeliveryOptions): PushDelivery {
  const { database, source, sender } = options;
  const now = options.now ?? Date.now;
  const sleep =
    options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const record = options.record ?? (() => {});
  const iso = (): string => new Date(now()).toISOString();
  const tickets = new Map<string, { deviceId: string; sentAt: number }>();
  let running: Promise<void> | undefined;
  let again = false;

  const row = (deviceId: string): DeviceRow | undefined =>
    database.read(
      (db) =>
        db.prepare('SELECT * FROM push_devices WHERE device_id = ?').get(deviceId) as
          | DeviceRow
          | undefined,
    );

  const drop = (deviceId: string): boolean =>
    database.transaction(
      (db) => {
        db.prepare('DELETE FROM push_sent WHERE device_id = ?').run(deviceId);
        return Number(
          db.prepare('DELETE FROM push_devices WHERE device_id = ?').run(deviceId).changes,
        );
      },
      ['push'],
    ) > 0;

  const dropToken = (deviceId: string, code: 'device-revoked' | 'device-not-registered'): void => {
    if (drop(deviceId)) record({ phase: 'token-dropped', deviceId, code });
  };

  const deliver = async (
    device: DeviceRow,
    messages: ExpoMessage[],
    kinds: Array<PushKind | 'badge' | 'test'>,
  ): Promise<boolean> => {
    for (let start = 0; start < messages.length; start += BATCH) {
      const batch = messages.slice(start, start + BATCH);
      let result: ExpoTicket[] | undefined;
      for (let attempt = 1; result === undefined; attempt += 1) {
        try {
          result = await sender.send(batch);
        } catch (error) {
          const code = error instanceof Error ? error.message : 'send-failed';
          const retryable = !(error instanceof PushSendError) || error.retryable;
          if (!retryable || attempt >= MAX_ATTEMPTS) {
            record({ phase: 'send-failed', deviceId: device.device_id, count: batch.length, code });
            return false;
          }
          record({ phase: 'retry', deviceId: device.device_id, attempt, code });
          await sleep(RETRY_BASE_MS * 2 ** (attempt - 1));
        }
      }
      let unregistered = false;
      result.forEach((ticket, index) => {
        const kind = kinds[start + index] ?? 'badge';
        if (ticket.status === 'ok') {
          record({ phase: 'sent', deviceId: device.device_id, kind, outcome: 'ok' });
          if (tickets.size < MAX_PENDING_RECEIPTS)
            tickets.set(ticket.id, { deviceId: device.device_id, sentAt: now() });
          return;
        }
        const code = ticket.details?.error ?? 'error';
        record({ phase: 'sent', deviceId: device.device_id, kind, outcome: 'error', code });
        if (code === 'DeviceNotRegistered') unregistered = true;
      });
      if (unregistered) {
        dropToken(device.device_id, 'device-not-registered');
        return false;
      }
    }
    return true;
  };

  const reconcileOnce = async (): Promise<void> => {
    const devices = database.read(
      (db) => db.prepare('SELECT * FROM push_devices').all() as unknown as DeviceRow[],
    );
    if (devices.length === 0) return;
    const { items, badge } = source.pending();
    const present = new Set(items.map((item) => item.id));
    const hostId = options.host().id;
    for (const device of devices) {
      if (!options.deviceActive(device.device_id)) {
        dropToken(device.device_id, 'device-revoked');
        continue;
      }
      const preferences = preferencesOf(device.preferences_json);
      const registeredAt = Date.parse(device.registered_at);
      const seen = new Set(
        database.read((db) =>
          (
            db
              .prepare('SELECT item_id FROM push_sent WHERE device_id = ?')
              .all(device.device_id) as Array<{ item_id: string }>
          ).map((entry) => entry.item_id),
        ),
      );
      const fresh = items.filter(
        (item) => !seen.has(item.id) && Date.parse(item.createdAt) >= registeredAt,
      );
      const gone = [...seen].filter((id) => !present.has(id));
      database.transaction(
        (db) => {
          const insert = db.prepare(
            'INSERT OR IGNORE INTO push_sent (device_id, item_id, sent_at) VALUES (?, ?, ?)',
          );
          for (const item of fresh) insert.run(device.device_id, item.id, iso());
          const remove = db.prepare('DELETE FROM push_sent WHERE device_id = ? AND item_id = ?');
          for (const id of gone) remove.run(device.device_id, id);
        },
        ['push'],
      );
      const notify = fresh.filter((item) => preferences[item.kind]);
      const messages: ExpoMessage[] = notify.map((item) => ({
        to: device.token,
        ...text(item, source.botName(item.botSlug) ?? item.botSlug, localeOf(device.locale)),
        sound: 'default',
        badge,
        priority: 'high',
        channelId: 'requests',
        ...(item.attentionKind === 'tool-approval' ? { categoryId: 'tool-approval' } : {}),
        data: {
          v: 1,
          hostId,
          itemId: item.id,
          kind: item.attentionKind,
          botSlug: item.botSlug,
          ...(item.channelId === undefined ? {} : { channelId: item.channelId }),
          ...(item.messageId === undefined ? {} : { messageId: item.messageId }),
        },
      }));
      const kinds: Array<PushKind | 'badge'> = notify.map((item) => item.kind);
      if (messages.length === 0 && device.badge !== badge) {
        messages.push({ to: device.token, badge, data: { v: 1, hostId } });
        kinds.push('badge');
      }
      if (messages.length > 0 && (await deliver(device, messages, kinds)))
        database.transaction(
          (db) =>
            db
              .prepare('UPDATE push_devices SET badge = ? WHERE device_id = ?')
              .run(badge, device.device_id),
          ['push'],
        );
    }
  };

  return {
    register(deviceId, input) {
      if (
        typeof input.token !== 'string' ||
        !TOKEN.test(input.token) ||
        (input.platform !== 'ios' && input.platform !== 'android')
      )
        return { ok: false, code: 'push-token-invalid' };
      const { token, platform } = input;
      const locale = localeOf(input.locale);
      database.transaction(
        (db) => {
          for (const other of db
            .prepare('SELECT device_id FROM push_devices WHERE token = ? AND device_id <> ?')
            .all(token, deviceId) as Array<{ device_id: string }>) {
            db.prepare('DELETE FROM push_sent WHERE device_id = ?').run(other.device_id);
            db.prepare('DELETE FROM push_devices WHERE device_id = ?').run(other.device_id);
          }
          db.prepare(
            `INSERT INTO push_devices (device_id, token, platform, locale, preferences_json, registered_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT (device_id) DO UPDATE SET
             token = excluded.token, platform = excluded.platform, locale = excluded.locale`,
          ).run(deviceId, token, platform, locale, JSON.stringify(DEFAULT_PUSH_PREFERENCES), iso());
        },
        ['push'],
      );
      record({ phase: 'registered', deviceId });
      return { ok: true };
    },

    unregister(deviceId) {
      const dropped = drop(deviceId);
      if (dropped) record({ phase: 'unregistered', deviceId });
      return dropped;
    },

    settings(deviceId) {
      const current = row(deviceId);
      return {
        registered: current !== undefined,
        preferences: preferencesOf(current?.preferences_json),
      };
    },

    setPreferences(deviceId, input) {
      const current = row(deviceId);
      if (current === undefined)
        return { registered: false, preferences: preferencesOf(undefined) };
      const next = preferencesOf(current.preferences_json);
      const patch = typeof input === 'object' && input !== null ? input : {};
      for (const kind of PUSH_KINDS) {
        const value = (patch as Record<string, unknown>)[kind];
        if (typeof value === 'boolean') next[kind] = value;
      }
      database.transaction(
        (db) =>
          db
            .prepare('UPDATE push_devices SET preferences_json = ? WHERE device_id = ?')
            .run(JSON.stringify(next), deviceId),
        ['push'],
      );
      record({ phase: 'preferences', deviceId });
      return { registered: true, preferences: next };
    },

    async test(deviceId) {
      const current = row(deviceId);
      if (current === undefined) return 'not-registered';
      const host = options.host();
      const badge = source.pending().badge;
      const text = TEST[localeOf(current.locale)];
      const ok = await deliver(
        current,
        [
          {
            to: current.token,
            title: text.title,
            body: text.body(host.name),
            sound: 'default',
            badge,
            channelId: 'requests',
            data: { v: 1, hostId: host.id, test: true },
          },
        ],
        ['test'],
      );
      return ok ? 'sent' : 'failed';
    },

    reconcile() {
      if (running !== undefined) {
        again = true;
        return running;
      }
      running = (async () => {
        try {
          do {
            again = false;
            await reconcileOnce();
          } while (again);
        } finally {
          running = undefined;
        }
      })();
      return running;
    },

    async checkReceipts() {
      const due = [...tickets].filter(([, ticket]) => now() - ticket.sentAt >= RECEIPT_DELAY_MS);
      for (let start = 0; start < due.length; start += BATCH) {
        const batch = due.slice(start, start + BATCH);
        let receipts: Record<string, ExpoReceipt>;
        try {
          receipts = await sender.receipts(batch.map(([id]) => id));
        } catch {
          return;
        }
        for (const [id, ticket] of batch) {
          tickets.delete(id);
          const receipt = receipts[id];
          if (receipt?.status === 'error' && receipt.details?.error === 'DeviceNotRegistered')
            dropToken(ticket.deviceId, 'device-not-registered');
        }
      }
    },
  };
}
