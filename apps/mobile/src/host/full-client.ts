import {
  fullClientHash,
  type FullClientTarget,
} from '../../../../packages/core/src/credentials/web-locator';

export type { FullClientTarget };

export const FULL_CLIENT_PATH = '/botharness-device/web/';

export interface FullClientSource {
  uri: string;
  headers: { Authorization: string };
}

export function fullClientSource(
  route: string,
  credential: string,
  target: FullClientTarget,
): FullClientSource {
  return {
    uri: `${route.replace(/\/+$/u, '')}${FULL_CLIENT_PATH}${fullClientHash(target)}`,
    headers: { Authorization: `Device ${credential}` },
  };
}

export function staysInFullClient(route: string, url: string): boolean {
  const base = `${route.replace(/\/+$/u, '')}${FULL_CLIENT_PATH}`;
  return url === base.slice(0, -1) || url.startsWith(base) || url === 'about:blank';
}

export type FullClientParams = {
  target?: string;
  slug?: string;
  channelId?: string;
  messageId?: string;
};

export function fullClientParams(target: FullClientTarget): FullClientParams {
  if (target.kind === 'dm') return { target: 'dm', slug: target.slug };
  if (target.kind === 'channel') return { target: 'channel', channelId: target.channelId };
  if (target.kind === 'private-input')
    return { target: 'private-input', channelId: target.channelId, messageId: target.messageId };
  return { target: 'home' };
}

export function fullClientTarget(params: FullClientParams): FullClientTarget {
  if (params.target === 'dm' && params.slug !== undefined) return { kind: 'dm', slug: params.slug };
  if (params.target === 'channel' && params.channelId !== undefined)
    return { kind: 'channel', channelId: params.channelId };
  if (
    params.target === 'private-input' &&
    params.channelId !== undefined &&
    params.messageId !== undefined
  )
    return { kind: 'private-input', channelId: params.channelId, messageId: params.messageId };
  return { kind: 'home' };
}
