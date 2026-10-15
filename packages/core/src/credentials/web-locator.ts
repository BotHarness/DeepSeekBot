import { isValidSlug } from '../bots/slug.js';

const PREFIX = '#botharness-private-input=';

export function privateInputWebUrl(base: string, channelId: string, messageId: string): string {
  const url = new URL(base);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  )
    throw new Error('Private input Web URL must be an explicit credential-free Web origin');
  url.hash = PREFIX.slice(1) + encodeURIComponent(JSON.stringify([channelId, messageId]));
  return url.href;
}

export function privateInputLocator(
  hash: string,
): { channelId: string; messageId: string } | undefined {
  if (!hash.startsWith(PREFIX) || hash.length > 1024) return undefined;
  try {
    const value: unknown = JSON.parse(decodeURIComponent(hash.slice(PREFIX.length)));
    if (
      !Array.isArray(value) ||
      value.length !== 2 ||
      typeof value[0] !== 'string' ||
      !/^dm-[A-Za-z0-9_-]{1,100}$/.test(value[0]) ||
      typeof value[1] !== 'string' ||
      !/^[0-9a-f-]{36}$/.test(value[1])
    )
      return undefined;
    return { channelId: value[0], messageId: value[1] };
  } catch {
    return undefined;
  }
}

export type FullClientTarget =
  | { kind: 'home' }
  | { kind: 'dm'; slug: string }
  | { kind: 'channel'; channelId: string }
  | { kind: 'private-input'; channelId: string; messageId: string };

export type FullClientLanding = Exclude<FullClientTarget, { kind: 'private-input' }>;

const OPEN_PREFIX = '#botharness-open=';
const CHANNEL_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

export function fullClientHash(target: FullClientTarget): string {
  if (target.kind === 'private-input')
    return PREFIX + encodeURIComponent(JSON.stringify([target.channelId, target.messageId]));
  if (target.kind === 'channel') return `${OPEN_PREFIX}channel:${target.channelId}`;
  return OPEN_PREFIX + (target.kind === 'dm' ? `dm:${encodeURIComponent(target.slug)}` : 'home');
}

export function fullClientLocator(hash: string): FullClientLanding | undefined {
  if (!hash.startsWith(OPEN_PREFIX) || hash.length > 256) return undefined;
  const value = hash.slice(OPEN_PREFIX.length);
  if (value === 'home') return { kind: 'home' };
  if (value.startsWith('channel:')) {
    const channelId = value.slice(8);
    return CHANNEL_ID.test(channelId) ? { kind: 'channel', channelId } : undefined;
  }
  if (!value.startsWith('dm:')) return undefined;
  try {
    const slug = decodeURIComponent(value.slice(3));
    return isValidSlug(slug) ? { kind: 'dm', slug } : undefined;
  } catch {
    return undefined;
  }
}
