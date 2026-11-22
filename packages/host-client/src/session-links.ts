import type { WireSessionLink } from '@botharness/host-protocol/wire';
import { record, some } from './host-answer';

export function parseSessionLinks(value: unknown): WireSessionLink[] {
  return some(value, (entry) => {
    const link = record(entry);
    if (link === undefined) return undefined;
    const { sessionId, title, kind } = link;
    return typeof sessionId === 'string' &&
      sessionId !== '' &&
      typeof title === 'string' &&
      (kind === 'created' || kind === 'sent')
      ? { sessionId, title, kind }
      : undefined;
  });
}
