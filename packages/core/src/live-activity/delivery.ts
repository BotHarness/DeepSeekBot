import type { ChannelRequestProgress } from '../channels/store.js';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import { ACTIVITY_TOKEN, type ActivityProvider } from './contract.js';

interface Registration {
  client_id: string;
  device_id: string;
  channel_id: string;
  message_id: string;
  source_event_id: string;
  handle: string;
  expires_at: number;
  revision: number;
  terminal: number;
  last_sent: number;
  last_state: string;
  pending_state: string;
  attempt_at: number;
  attempts: number;
  locale: 'en' | 'zh';
}
export interface ActivityRequest {
  method: string;
  path: string;
  deviceId: string;
  body: Record<string, unknown>;
}
export interface ActivityDelivery {
  handle(input: ActivityRequest): Promise<{ status: number; body: unknown }>;
  revoke(deviceId: string): Promise<void>;
  reconcile(): Promise<void>;
  dispose(): void;
}
const refusal = (status: number, code: string) => ({ status, body: { code } });
const text = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 128;

export function createActivityDelivery(options: {
  database: OperationalDatabaseModulePort;
  provider: ActivityProvider;
  deviceActive(deviceId: string): boolean;
  request(
    channelId: string,
    messageId: string,
  ): { sourceEventId: string; progress: ChannelRequestProgress; assignmentId?: string } | undefined;
  now?: () => number;
  record?: (
    phase: string,
    detail: { initiator: 'device' | 'host' | 'lifecycle'; code: string; durationMs: number },
  ) => void;
}): ActivityDelivery {
  const { database, provider } = options;
  const now = options.now ?? Date.now;
  const lifetime = new AbortController();
  let disposed = false;
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(work: () => Promise<T>): Promise<T> => {
    const next = queue.then(work, work);
    queue = next.catch(() => undefined);
    return next;
  };
  const rows = () =>
    database.read((db) =>
      db
        .prepare(
          'SELECT * FROM device_live_activities WHERE terminal <> 1 ORDER BY client_id LIMIT 32',
        )
        .all(),
    ) as unknown as Registration[];
  const retire = async (row: Registration, code = 'display-stopped'): Promise<boolean> => {
    if (disposed) return false;
    const started = now();
    if (row.expires_at <= now()) {
      database.transaction((db) => {
        db.prepare('UPDATE device_live_activities SET terminal = 1 WHERE client_id = ?').run(
          row.client_id,
        );
      });
      options.record?.('retired', {
        initiator: 'host',
        code: 'registration-expired',
        durationMs: now() - started,
      });
      return true;
    }
    if (
      row.terminal === 2 &&
      now() - row.attempt_at < Math.min(120_000, 5_000 * 2 ** Math.min(row.attempts - 1, 5))
    )
      return false;
    database.transaction((db) => {
      db.prepare(
        'UPDATE device_live_activities SET terminal = 2, attempt_at = ?, attempts = ?, pending_state = ? WHERE client_id = ?',
      ).run(now(), row.terminal === 2 ? row.attempts + 1 : 1, '', row.client_id);
    });
    const result = await provider
      .call({ operation: 'stop', handle: row.handle, deviceId: row.device_id }, lifetime.signal)
      .catch(() => ({ status: 503 }));
    if (disposed) return false;
    const acknowledged = [200, 404, 409, 410].includes(result.status);
    if (acknowledged)
      database.transaction((db) => {
        db.prepare('UPDATE device_live_activities SET terminal = 1 WHERE client_id = ?').run(
          row.client_id,
        );
      });
    options.record?.(acknowledged ? 'retired' : 'cleanup-pending', {
      initiator: 'host',
      code: `${code}-http-${result.status}`,
      durationMs: now() - started,
    });
    return acknowledged;
  };
  const reconcileRow = async (clientId: string) => {
    if (disposed) return;
    const started = now();
    const row = rows().find((item) => item.client_id === clientId);
    if (!row) return;
    if (row.terminal === 2) {
      await retire(row, 'cleanup-retry');
      return;
    }
    if (!options.deviceActive(row.device_id) || row.expires_at <= now()) {
      await retire(row, row.expires_at <= now() ? 'expired' : 'device-revoked');
      return;
    }
    const current = options.request(row.channel_id, row.message_id);
    if (!current || current.sourceEventId !== row.source_event_id) {
      await retire(row, 'request-unavailable');
      return;
    }
    const pending = row.pending_state
      ? (JSON.parse(row.pending_state) as ChannelRequestProgress)
      : undefined;
    const progress = pending?.terminal ? pending : current.progress;
    const snapshot = JSON.stringify(progress);
    const retrying = snapshot === row.pending_state;
    if (
      retrying &&
      now() - row.attempt_at < Math.min(120_000, 5_000 * 2 ** Math.min(row.attempts - 1, 5))
    )
      return;
    if (!row.pending_state && snapshot === row.last_state && now() - row.last_sent < 120_000)
      return;
    const revision = retrying ? row.revision : row.revision + 1;
    database.transaction((db) => {
      db.prepare(
        'UPDATE device_live_activities SET revision = ?, pending_state = ?, attempt_at = ?, attempts = ? WHERE client_id = ?',
      ).run(revision, snapshot, now(), retrying ? row.attempts + 1 : 1, row.client_id);
    });
    if (!options.deviceActive(row.device_id)) {
      await retire(row);
      return;
    }
    const result = await provider
      .call(
        {
          operation: 'update',
          handle: row.handle,
          deviceId: row.device_id,
          revision,
          ...progress,
          locale: row.locale,
        },
        lifetime.signal,
      )
      .catch(() => ({ status: 503, body: {} as Record<string, unknown> }));
    if (disposed) return;
    if (result.status === 200)
      database.transaction((db) => {
        db.prepare(
          'UPDATE device_live_activities SET terminal = ?, last_sent = ?, last_state = ?, pending_state = ?, attempts = 0 WHERE client_id = ?',
        ).run(progress.terminal ? 1 : 0, now(), snapshot, '', row.client_id);
      });
    else if ([404, 409, 410].includes(result.status)) await retire(row);
    options.record?.(result.status === 200 ? 'delivered' : 'delivery-unavailable', {
      initiator: 'host',
      code: `provider-http-${result.status}`,
      durationMs: now() - started,
    });
  };
  let reconciliation: Promise<void> | undefined;
  const reconcile = (): Promise<void> => {
    if (disposed) return Promise.resolve();
    if (reconciliation) return reconciliation;
    reconciliation = (async () => {
      for (const row of rows()) {
        if (disposed) break;
        await serial(() => reconcileRow(row.client_id));
      }
      if (disposed) return;
      database.transaction((db) => {
        db.prepare('DELETE FROM device_live_activities WHERE terminal = 1 AND expires_at < ?').run(
          now() - 24 * 60 * 60_000,
        );
      });
    })().finally(() => {
      reconciliation = undefined;
    });
    return reconciliation;
  };
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      lifetime.abort();
      options.record?.('disposed', { initiator: 'lifecycle', code: 'owner-closed', durationMs: 0 });
    },
    reconcile,
    revoke: (deviceId) =>
      serial(async () => {
        if (disposed) return;
        for (const row of rows())
          if (row.device_id === deviceId) await retire(row, 'device-revoked');
      }),
    handle: (input) => {
      const started = now();
      return serial(async () => {
        if (disposed) return refusal(503, 'activity-owner-closed');
        const { deviceId, body, path, method } = input;
        if (!options.deviceActive(deviceId)) return refusal(401, 'device-revoked');
        if (method === 'GET' && path === '/botharness-device/activity') {
          const capability = await provider.capability(lifetime.signal).catch(() => undefined);
          if (disposed) return refusal(503, 'activity-owner-closed');
          return capability
            ? { status: 200, body: capability }
            : refusal(503, 'activity-provider-unconfigured');
        }
        if (method !== 'POST') return refusal(404, 'not-found');
        if (path === '/botharness-device/activity/stop') {
          if (!text(body['clientActivityId'])) return refusal(400, 'activity-input-invalid');
          for (const row of rows())
            if (row.device_id === deviceId && row.client_id === body['clientActivityId'])
              if (!(await retire(row))) return refusal(503, 'activity-cleanup-pending');
          return { status: 200, body: { stopped: true } };
        }
        if (path === '/botharness-device/activity/status') {
          if (!text(body['clientActivityId'])) return refusal(400, 'activity-input-invalid');
          const row = database.read((db) =>
            db
              .prepare('SELECT * FROM device_live_activities WHERE client_id = ? AND device_id = ?')
              .get(String(body['clientActivityId']), deviceId),
          ) as Registration | undefined;
          if (!row) return refusal(404, 'activity-not-found');
          const request = options.request(row.channel_id, row.message_id);
          if (!request || request.sourceEventId !== row.source_event_id)
            return refusal(404, 'activity-request-not-found');
          return {
            status: 200,
            body: {
              channelId: row.channel_id,
              messageId: row.message_id,
              progress: request.progress,
              ...(request.assignmentId === undefined ? {} : { assignmentId: request.assignmentId }),
            },
          };
        }
        if (path === '/botharness-device/activity/prepare') {
          const { channelId, messageId, bundleIdentifier } = body;
          if (!text(channelId) || !text(messageId)) return refusal(400, 'activity-input-invalid');
          const capability = await provider.capability(lifetime.signal).catch(() => undefined);
          if (disposed) return refusal(503, 'activity-owner-closed');
          if (!capability?.source) return refusal(503, 'activity-provider-unconfigured');
          if (!options.deviceActive(deviceId)) return refusal(401, 'device-revoked');
          if (capability.bundleIdentifier !== bundleIdentifier)
            return refusal(409, 'activity-app-unsupported');
          const request = options.request(channelId, messageId);
          if (!request) return refusal(404, 'activity-request-not-found');
          if (request.progress.terminal) return refusal(409, 'activity-ended');
          return {
            status: 200,
            body: {
              ...capability,
              source: capability.source,
              progress: request.progress,
              ...(request.assignmentId === undefined ? {} : { assignmentId: request.assignmentId }),
            },
          };
        }
        if (path !== '/botharness-device/activity/register') return refusal(404, 'not-found');
        const { clientActivityId, token, channelId, messageId, bundleIdentifier } = body;
        if (
          !text(clientActivityId) ||
          !text(channelId) ||
          !text(messageId) ||
          typeof token !== 'string' ||
          !ACTIVITY_TOKEN.test(token)
        )
          return refusal(400, 'activity-input-invalid');
        const capability = await provider.capability(lifetime.signal).catch(() => undefined);
        if (disposed) return refusal(503, 'activity-owner-closed');
        if (!capability) return refusal(503, 'activity-provider-unconfigured');
        if (bundleIdentifier !== capability.bundleIdentifier)
          return refusal(409, 'activity-app-unsupported');
        const request = options.request(channelId, messageId);
        if (!request) return refusal(404, 'activity-request-not-found');
        const old = database.read((db) =>
          db
            .prepare('SELECT * FROM device_live_activities WHERE client_id = ?')
            .get(clientActivityId),
        ) as Registration | undefined;
        if (
          old &&
          (old.device_id !== deviceId ||
            old.channel_id !== channelId ||
            old.message_id !== messageId ||
            old.source_event_id !== request.sourceEventId)
        )
          return refusal(404, 'activity-not-found');
        if (request.progress.terminal || old?.terminal || (old && old.expires_at <= now()))
          return refusal(409, 'activity-ended');
        if (rows().some((row) => row.device_id === deviceId && row.client_id !== clientActivityId))
          return refusal(409, 'activity-already-tracked');
        if (!options.deviceActive(deviceId)) return refusal(401, 'device-revoked');
        const result = await provider
          .call(
            { operation: 'register', deviceId, clientActivityId, token, bundleIdentifier },
            lifetime.signal,
          )
          .catch(() => ({ status: 503, body: {} as Record<string, unknown> }));
        if (disposed) return refusal(503, 'activity-owner-closed');
        const { handle, expiresAt } = result.body;
        if (
          result.status !== 200 ||
          !text(handle) ||
          typeof expiresAt !== 'number' ||
          expiresAt <= now()
        )
          return refusal(
            result.status >= 400 ? result.status : 502,
            'activity-registration-unavailable',
          );
        if (!options.deviceActive(deviceId)) {
          await provider
            .call({ operation: 'stop', deviceId, handle }, lifetime.signal)
            .catch(() => undefined);
          return refusal(401, 'device-revoked');
        }
        database.transaction((db) => {
          db.prepare(`INSERT INTO device_live_activities(client_id, device_id, channel_id, message_id, source_event_id, handle, expires_at, locale)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(client_id) DO UPDATE SET handle = excluded.handle`).run(
            clientActivityId,
            deviceId,
            channelId,
            messageId,
            request.sourceEventId,
            handle,
            expiresAt,
            body['locale'] === 'zh' ? 'zh' : 'en',
          );
        });
        return {
          status: 200,
          body: {
            registered: true,
            expiresAt,
            sourceEventId: request.sourceEventId,
            progress: request.progress,
            ...(request.assignmentId === undefined ? {} : { assignmentId: request.assignmentId }),
          },
        };
      }).then((result) => {
        if (!disposed)
          options.record?.('request', {
            initiator: 'device',
            code:
              'code' in (result.body as object)
                ? String((result.body as { code: string }).code)
                : `http-${result.status}`,
            durationMs: now() - started,
          });
        return result;
      });
    },
  };
}
