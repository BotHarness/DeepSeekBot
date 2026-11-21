import { asRecord } from './bridge-transport.js';
import type { ChannelAuthor } from './store.js';

export function parseAuthor(value: unknown): ChannelAuthor | undefined {
  const record = asRecord(value);
  if (record === undefined) return undefined;
  switch (record['kind']) {
    case 'human': {
      const humanId = record['humanId'];
      const displayName = record['displayName'];
      return {
        kind: 'human',
        ...(typeof humanId === 'string' && humanId.length > 0 ? { humanId } : {}),
        ...(typeof displayName === 'string' && displayName.length > 0 ? { displayName } : {}),
        ...(record['deleted'] === true ? { deleted: true } : {}),
      };
    }
    case 'system':
      return { kind: 'system' };
    case 'bot':
      return typeof record['slug'] === 'string' && record['slug'].length > 0
        ? {
            kind: 'bot',
            slug: record['slug'],
            ...(typeof record['displayName'] === 'string' && record['displayName'].length > 0
              ? { displayName: record['displayName'] }
              : {}),
          }
        : undefined;
    case 'remote-bot':
      return typeof record['hostId'] === 'string' &&
        /^[a-zA-Z0-9_-]{1,128}$/u.test(record['hostId']) &&
        typeof record['slug'] === 'string' &&
        record['slug'].length > 0
        ? { kind: 'remote-bot', hostId: record['hostId'], slug: record['slug'] }
        : undefined;
    case 'bridged':
      return typeof record['source'] === 'string' && record['source'].length > 0
        ? { kind: 'bridged', source: record['source'] }
        : undefined;
    default:
      return undefined;
  }
}
