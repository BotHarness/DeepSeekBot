import type { HostCarrier } from './carrier';
import type { SavedHost } from './hosts';
import { DEVICE_PREFIX } from './pairing';

export const PUSH_KINDS = ['approval', 'question', 'private-input', 'reply'] as const;
export type PushKind = (typeof PUSH_KINDS)[number];
export type PushPreferences = Record<PushKind, boolean>;

export interface PushSettings {
  registered: boolean;
  enabled: boolean;
  preferences: PushPreferences;
  quietChannelIds: string[];
}

export type PushRefusal =
  | 'push-not-registered'
  | 'push-token-invalid'
  | 'invalid-input'
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

export type ChatHref =
  | { pathname: '/dm/[slug]'; params: { slug: string; focus?: string } }
  | { pathname: '/channel/[id]'; params: { id: string; focus?: string } };

export type PushHref =
  | { pathname: '/inbox/[id]'; params: Record<string, string> }
  | ChatHref
  | { pathname: '/activity' };

const REPLIES = new Set(['channel-reply', 'channel-mention']);
const CARDS = new Set(['tool-approval', 'user-question', 'workspace-grant-request']);

function chatHref(
  botSlug: string,
  channelId: string,
  dmChannelOf: (slug: string) => string | undefined,
  isGroup: (channelId: string) => boolean,
  focus?: string,
): ChatHref | undefined {
  const at = focus === undefined ? {} : { focus };
  if (dmChannelOf(botSlug) === channelId)
    return { pathname: '/dm/[slug]', params: { slug: botSlug, ...at } };
  if (isGroup(channelId)) return { pathname: '/channel/[id]', params: { id: channelId, ...at } };
  return undefined;
}

export function cardHref(
  item: { kind?: string; botSlug?: string; channelId?: string; messageId?: string },
  dmChannelOf: (slug: string) => string | undefined,
  isGroup: (channelId: string) => boolean = () => false,
): ChatHref | undefined {
  if (
    item.kind === undefined ||
    !CARDS.has(item.kind) ||
    item.botSlug === undefined ||
    item.messageId === undefined ||
    item.channelId === undefined
  )
    return undefined;
  return chatHref(item.botSlug, item.channelId, dmChannelOf, isGroup, item.messageId);
}

export function unreadHref(
  item: { kind: string; botSlug: string; channelId?: string },
  dmChannelOf: (slug: string) => string | undefined,
  isGroup: (channelId: string) => boolean = () => false,
): ChatHref | undefined {
  if (item.kind !== 'channel-unread' || item.channelId === undefined) return undefined;
  return chatHref(item.botSlug, item.channelId, dmChannelOf, isGroup);
}

export function pushHref(
  target: PushTarget,
  dmChannelOf: (slug: string) => string | undefined,
  isGroup: (channelId: string) => boolean = () => false,
): PushHref {
  if (target.itemId === undefined || target.kind === undefined || target.botSlug === undefined)
    return { pathname: '/activity' };
  if (REPLIES.has(target.kind) && target.channelId !== undefined) {
    const chat = chatHref(target.botSlug, target.channelId, dmChannelOf, isGroup);
    if (chat !== undefined) return chat;
  }
  const card = cardHref(target, dmChannelOf, isGroup);
  if (card !== undefined) return card;
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
  const quiet = body['quietChannelIds'];
  return {
    registered: body['registered'] === true,
    enabled: body['enabled'] !== false,
    preferences: Object.fromEntries(
      PUSH_KINDS.map((kind) => [kind, preferences[kind] !== false]),
    ) as PushPreferences,
    quietChannelIds: Array.isArray(quiet)
      ? quiet.filter((id): id is string => typeof id === 'string')
      : [],
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
  setEnabled(host: SavedHost, enabled: boolean): Promise<PushSettings>;
  setQuiet(host: SavedHost, channelId: string, quiet: boolean): Promise<PushSettings>;
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
    setEnabled: async (host, enabled) =>
      settingsOf(await request(host, '/preferences', { enabled })),
    setQuiet: async (host, channelId, quiet) =>
      settingsOf(await request(host, '/quiet', { channelId, quiet })),
    async test(host) {
      await request(host, '/test', {});
    },
    async unregister(host) {
      await request(host, '/unregister', {});
    },
  };
}
