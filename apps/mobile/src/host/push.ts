import type { HostCarrier } from './carrier';
import type { SavedHost } from './hosts';
import { DEVICE_PREFIX } from './pairing';

export const PUSH_KINDS = ['approval', 'question', 'private-input', 'reply'] as const;
export type PushKind = (typeof PUSH_KINDS)[number];
export type PushPreferences = Record<PushKind, boolean>;

export interface PushSettings {
  registered: boolean;
  preferences: PushPreferences;
}

export type PushRefusal =
  | 'push-not-registered'
  | 'push-token-invalid'
  | 'push-send-failed'
  | 'device-revoked'
  | 'device-unknown'
  | 'device-credential-missing'
  | 'unreachable';

export class PushRequestFailed extends Error {
  constructor(readonly code: PushRefusal) {
    super(code);
  }
}

export interface PushTarget {
  hostId: string;
  itemId?: string;
  kind?: string;
  botSlug?: string;
  channelId?: string;
  messageId?: string;
  test?: true;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

export function parsePushData(input: unknown): PushTarget | undefined {
  const data = record(input);
  if (data['v'] !== 1 || typeof data['hostId'] !== 'string' || data['hostId'] === '')
    return undefined;
  const target: PushTarget = { hostId: data['hostId'] };
  for (const key of ['itemId', 'kind', 'botSlug', 'channelId', 'messageId'] as const) {
    const value = data[key];
    if (typeof value === 'string' && value !== '') target[key] = value;
  }
  if (data['test'] === true) target.test = true;
  return target;
}

export type PushHref =
  | { pathname: '/inbox/[id]'; params: Record<string, string> }
  | { pathname: '/dm/[slug]'; params: { slug: string } }
  | { pathname: '/activity' };

const REPLIES = new Set(['channel-reply', 'channel-mention']);

export function pushHref(
  target: PushTarget,
  dmChannelOf: (slug: string) => string | undefined,
): PushHref {
  if (target.itemId === undefined || target.kind === undefined || target.botSlug === undefined)
    return { pathname: '/activity' };
  if (
    REPLIES.has(target.kind) &&
    target.channelId !== undefined &&
    dmChannelOf(target.botSlug) === target.channelId
  )
    return { pathname: '/dm/[slug]', params: { slug: target.botSlug } };
  return {
    pathname: '/inbox/[id]',
    params: {
      id: target.itemId,
      kind: target.kind,
      botSlug: target.botSlug,
      ...(target.channelId === undefined ? {} : { channelId: target.channelId }),
      ...(target.messageId === undefined ? {} : { messageId: target.messageId }),
    },
  };
}

function settingsOf(value: unknown): PushSettings {
  const body = record(value);
  const preferences = record(body['preferences']);
  return {
    registered: body['registered'] === true,
    preferences: Object.fromEntries(
      PUSH_KINDS.map((kind) => [kind, preferences[kind] !== false]),
    ) as PushPreferences,
  };
}

export interface PushRegistration {
  token: string;
  platform: 'ios' | 'android';
  locale: 'en' | 'zh';
}

export interface HostPush {
  settings(host: SavedHost): Promise<PushSettings>;
  register(host: SavedHost, registration: PushRegistration): Promise<PushSettings>;
  setPreferences(host: SavedHost, preferences: Partial<PushPreferences>): Promise<PushSettings>;
  test(host: SavedHost): Promise<void>;
  unregister(host: SavedHost): Promise<void>;
}

export function createHostPush(carrier: HostCarrier, timeoutMs = 10_000): HostPush {
  const request = async (
    host: SavedHost,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<unknown> => {
    for (const route of host.routes) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let status: number;
      let text: string;
      try {
        const response = await carrier.request(`${route}${DEVICE_PREFIX}/push${path}`, {
          method: body === undefined ? 'GET' : 'POST',
          headers: { authorization: `Device ${host.credential}` },
          signal: controller.signal,
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        status = response.status;
        text = await response.text();
      } catch {
        continue;
      } finally {
        clearTimeout(timer);
      }
      let value: unknown;
      try {
        value = JSON.parse(text);
      } catch {
        continue;
      }
      if (status === 200) return value;
      const code = record(value)['code'];
      if (typeof code === 'string' && status >= 400 && status < 500)
        throw new PushRequestFailed(code as PushRefusal);
      if (status === 502) throw new PushRequestFailed('push-send-failed');
    }
    throw new PushRequestFailed('unreachable');
  };

  return {
    settings: async (host) => settingsOf(await request(host, '')),
    register: async (host, registration) =>
      settingsOf(await request(host, '/register', { ...registration })),
    setPreferences: async (host, preferences) =>
      settingsOf(await request(host, '/preferences', { preferences })),
    async test(host) {
      await request(host, '/test', {});
    },
    async unregister(host) {
      await request(host, '/unregister', {});
    },
  };
}
