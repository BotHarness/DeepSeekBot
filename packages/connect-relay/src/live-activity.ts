import {
  ACTIVITY_LIFETIME_MS,
  ACTIVITY_TOKEN,
  type ActivityCapability,
  type ActivityContent,
} from '../../core/src/live-activity/contract.js';
import type { D1Database } from './d1.js';

export interface ActivitySender {
  capability(): Promise<ActivityCapability | undefined>;
  send(
    input: ActivityContent & { token: string; timestamp: number; source: string },
  ): Promise<'sent' | 'invalid-token' | 'unavailable'>;
}
interface Registration {
  handle: string;
  host_id: string;
  device_id: string;
  client_id: string;
  token: string | null;
  expires_at: number;
  revision: number;
  timestamp: number;
  terminal: number;
  content: string;
  delivered_revision: number;
  lease_until: number;
}
const identity = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/u.test(value);
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
const failure = (status: number, code: string) => reply(status, { error: { code } });
const changed = (result: unknown) => {
  const value = result as { changes?: number; meta?: { changes?: number } };
  return (value.meta?.changes ?? value.changes ?? 0) > 0;
};

export function createActivityRegistry(
  db: D1Database,
  sender: ActivitySender | undefined,
  now: () => Date,
) {
  return async (hostId: string, source: string, request: Request): Promise<Response> => {
    const capability = await sender?.capability().catch(() => undefined);
    if (!capability || !sender) return failure(503, 'activity-provider-unconfigured');
    if (request.method === 'GET') return reply(200, { ...capability, source });
    if (request.method !== 'POST') return failure(405, 'method-not-allowed');
    let body: Record<string, unknown>;
    try {
      const text = await request.text();
      if (text.length > 4096) return failure(413, 'activity-input-invalid');
      body = JSON.parse(text) as Record<string, unknown>;
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('invalid');
    } catch {
      return failure(400, 'activity-input-invalid');
    }
    const { operation, deviceId } = body;
    if (!identity(deviceId)) return failure(400, 'activity-input-invalid');
    const at = now().getTime();
    if (operation === 'register') {
      const { token, clientActivityId, bundleIdentifier } = body;
      if (
        typeof token !== 'string' ||
        !ACTIVITY_TOKEN.test(token) ||
        !identity(clientActivityId) ||
        bundleIdentifier !== capability.bundleIdentifier
      )
        return failure(400, 'activity-input-invalid');
      const existing = await db
        .prepare('SELECT * FROM live_activities WHERE host_id = ? AND client_id = ?')
        .bind(hostId, clientActivityId)
        .first<Registration>();
      if (existing) {
        if (existing.device_id !== deviceId) return failure(404, 'activity-not-found');
        if (existing.terminal || existing.expires_at <= at) return failure(409, 'activity-ended');
        const rotated = await db
          .prepare(
            'UPDATE live_activities SET token = ? WHERE handle = ? AND terminal = 0 AND lease_until <= ?',
          )
          .bind(token, existing.handle, at)
          .run();
        if (!changed(rotated)) return failure(503, 'activity-delivery-pending');
        return reply(200, { handle: existing.handle, expiresAt: existing.expires_at });
      }
      const handle = crypto.randomUUID();
      const expiresAt = at + ACTIVITY_LIFETIME_MS;
      const result = await db
        .prepare(`INSERT INTO live_activities(handle, host_id, device_id, client_id, token, expires_at)
        SELECT ?, ?, ?, ?, ?, ? WHERE
        NOT EXISTS (SELECT 1 FROM live_activities WHERE host_id = ? AND device_id = ? AND terminal <> 1 AND expires_at > ?)
        AND (SELECT COUNT(*) FROM live_activities WHERE host_id = ? AND expires_at > ?) < 32`)
        .bind(
          handle,
          hostId,
          deviceId,
          clientActivityId,
          token,
          expiresAt,
          hostId,
          deviceId,
          at,
          hostId,
          at,
        )
        .run();
      if (!changed(result)) return failure(409, 'activity-limit');
      return reply(200, { handle, expiresAt });
    }
    const { handle } = body;
    if (!identity(handle)) return failure(400, 'activity-input-invalid');
    const current = await db
      .prepare('SELECT * FROM live_activities WHERE handle = ? AND host_id = ? AND device_id = ?')
      .bind(handle, hostId, deviceId)
      .first<Registration>();
    if (!current) return failure(404, 'activity-not-found');
    if (current.expires_at <= at) {
      await db
        .prepare('UPDATE live_activities SET token = NULL, terminal = 1 WHERE handle = ?')
        .bind(handle)
        .run();
      return failure(410, 'activity-expired');
    }
    const stopping = operation === 'stop';
    const { revision, state, terminal, updatedAt, locale } = body;
    if (
      !stopping &&
      (operation !== 'update' ||
        typeof revision !== 'number' ||
        !Number.isSafeInteger(revision) ||
        revision < 1 ||
        !['working', 'completed', 'failed', 'unknown'].includes(String(state)) ||
        typeof terminal !== 'boolean' ||
        typeof updatedAt !== 'string' ||
        !Number.isFinite(Date.parse(updatedAt)) ||
        !['en', 'zh'].includes(String(locale)) ||
        ((state === 'completed' || state === 'failed') && !terminal))
    )
      return failure(409, 'activity-replay');
    const content: ActivityContent = {
      state: stopping ? 'unknown' : (state as ActivityContent['state']),
      terminal: stopping || terminal === true,
      updatedAt: stopping ? now().toISOString() : String(updatedAt),
      locale: locale === 'zh' ? 'zh' : 'en',
    };
    const encoded = JSON.stringify(content);
    if (
      !stopping &&
      revision === current.revision &&
      encoded === current.content &&
      current.delivered_revision === revision
    )
      return reply(200, { accepted: true });
    if (stopping && current.terminal === 1) return reply(200, { accepted: true });
    if (current.terminal === 1 || !current.token) return failure(409, 'activity-ended');
    const retrying = !stopping && revision === current.revision && encoded === current.content;
    if (!stopping && !retrying && (Number(revision) <= current.revision || current.terminal === 2))
      return failure(409, 'activity-replay');
    if (!stopping && current.lease_until > at) return failure(503, 'activity-delivery-pending');
    const nextRevision = stopping ? current.revision + 1 : Number(revision);
    const timestamp = retrying
      ? current.timestamp
      : Math.max(Math.floor(at / 1000), current.timestamp + 1);
    const lease = stopping ? 0 : at + 45_000;
    const claimed = await db
      .prepare(`UPDATE live_activities SET revision = ?, timestamp = ?, terminal = ?, content = ?, lease_until = ?, token = CASE WHEN ? = 1 THEN NULL ELSE token END
      WHERE handle = ? AND revision = ? AND terminal = ? AND token = ? AND (? = 1 OR lease_until <= ?)`)
      .bind(
        nextRevision,
        timestamp,
        stopping ? 1 : content.terminal ? 2 : 0,
        encoded,
        lease,
        stopping ? 1 : 0,
        handle,
        current.revision,
        current.terminal,
        current.token,
        stopping ? 1 : 0,
        at,
      )
      .run();
    if (!changed(claimed)) return failure(503, 'activity-delivery-pending');
    const result = await sender
      .send({ token: current.token, timestamp, source, ...content })
      .catch(() => 'unavailable' as const);
    if (result === 'invalid-token') {
      await db
        .prepare(
          'UPDATE live_activities SET token = NULL, terminal = 1, lease_until = 0 WHERE handle = ? AND revision = ?',
        )
        .bind(handle, nextRevision)
        .run();
      return failure(410, 'activity-token-invalid');
    }
    if (result === 'sent') {
      await db
        .prepare(`UPDATE live_activities SET delivered_revision = ?, terminal = ?, token = CASE WHEN ? = 1 THEN NULL ELSE token END, lease_until = 0
        WHERE handle = ? AND revision = ? AND lease_until = ?`)
        .bind(
          nextRevision,
          content.terminal ? 1 : 0,
          content.terminal ? 1 : 0,
          handle,
          nextRevision,
          lease,
        )
        .run();
      return reply(200, { accepted: true });
    }
    if (!stopping)
      await db
        .prepare(
          'UPDATE live_activities SET lease_until = ? WHERE handle = ? AND revision = ? AND lease_until = ?',
        )
        .bind(now().getTime() + 5_000, handle, nextRevision, lease)
        .run();
    return failure(502, 'activity-delivery-unavailable');
  };
}
