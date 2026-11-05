import { mediaCacheKey } from './conversation';

export interface PurgedPlacement {
  sourceEventId: string;
  channelId: string;
  messageId: string;
  fileIds: string[];
}

export interface PurgeTargets {
  forgetMedia(prefixes: readonly string[]): void;
  forgetShared(prefixes: readonly string[]): void;
  redactTail(hostId: string, purged: (channelId: string, messageId: string) => boolean): void;
}

const text = (value: unknown): value is string => typeof value === 'string' && value !== '';

export function purgedPlacements(value: unknown): PurgedPlacement[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item: unknown) => {
    if (typeof item !== 'object' || item === null) return [];
    const record = item as Record<string, unknown>;
    if (!text(record['sourceEventId']) || !text(record['channelId']) || !text(record['messageId']))
      return [];
    const fileIds = Array.isArray(record['fileIds']) ? record['fileIds'].filter(text) : [];
    return [
      {
        sourceEventId: record['sourceEventId'],
        channelId: record['channelId'],
        messageId: record['messageId'],
        fileIds,
      },
    ];
  });
}

export function createPurgeCaches(target: () => PurgeTargets | undefined) {
  const applied = new Map<string, Set<string>>();
  return {
    apply(hostId: string, frame: unknown): PurgedPlacement[] {
      let seen = applied.get(hostId);
      if (seen === undefined) {
        seen = new Set();
        applied.set(hostId, seen);
      }
      const fresh = purgedPlacements(frame).filter(
        (placement) => !seen.has(placement.sourceEventId),
      );
      const targets = target();
      if (fresh.length === 0 || targets === undefined) return fresh;
      const prefixes = fresh.flatMap((placement) =>
        placement.fileIds.map((fileId) => mediaCacheKey(hostId, fileId)),
      );
      targets.forgetMedia(prefixes);
      targets.forgetShared(prefixes);
      const purged = new Set(
        fresh.map((placement) => `${placement.channelId}\u0000${placement.messageId}`),
      );
      targets.redactTail(hostId, (channelId, messageId) =>
        purged.has(`${channelId}\u0000${messageId}`),
      );
      for (const placement of fresh) seen.add(placement.sourceEventId);
      return fresh;
    },
    forgetHost(hostId: string): void {
      applied.delete(hostId);
      const targets = target();
      if (targets === undefined) return;
      targets.forgetMedia([`${hostId}/`]);
      targets.forgetShared([`${hostId}/`]);
    },
  };
}

let installed: PurgeTargets | undefined;

export function installPurgeTargets(next: PurgeTargets | undefined): void {
  installed = next;
}

export const purgeCaches = createPurgeCaches(() => installed);
