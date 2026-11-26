import { HOST_COLOR_IDS, type HostColorId } from '@botharness/host-client/ui/design/host-look';
import type {
  HostSessionRow,
  HostSessionSourceOption,
} from '@botharness/host-protocol/host-sessions';

export type SessionQueryRow = HostSessionRow & { hostId: string; hostName: string };

export function sessionRowTime(row: HostSessionRow): number {
  return row.sortedAt ?? row.lastPromptAt ?? row.updatedAt;
}

export function mergeSessionRows(
  reads: readonly { hostId: string; hostName: string; rows: readonly HostSessionRow[] }[],
): SessionQueryRow[] {
  if (reads.length === 1) {
    const [read] = reads;
    return read!.rows.map((row) => ({ ...row, hostId: read!.hostId, hostName: read!.hostName }));
  }
  return reads
    .flatMap((read) =>
      read.rows.map((row) => ({ ...row, hostId: read.hostId, hostName: read.hostName })),
    )
    .sort(
      (a, b) =>
        sessionRowTime(b) - sessionRowTime(a) ||
        b.updatedAt - a.updatedAt ||
        a.hostId.localeCompare(b.hostId) ||
        a.sessionId.localeCompare(b.sessionId),
    );
}

export function mergeSessionSources(
  lists: readonly (readonly HostSessionSourceOption[])[],
): HostSessionSourceOption[] {
  const byId = new Map<string, HostSessionSourceOption>();
  for (const list of lists)
    for (const item of list) {
      const id = item.kind === 'native' ? 'native' : `bot:${item.botSlug}`;
      if (!byId.has(id)) byId.set(id, item);
    }
  return [...byId.values()].sort((a, b) => {
    if (a.kind === 'native') return b.kind === 'native' ? 0 : -1;
    if (b.kind === 'native') return 1;
    return a.displayName.localeCompare(b.displayName) || a.botSlug.localeCompare(b.botSlug);
  });
}

const LATIN = /^[\p{Script=Latin}\p{Nd}]/u;

export function folderMonogram(name: string | undefined): string {
  const text = (name ?? '').trim();
  if (text === '') return '·';
  const first = [...text][0]!;
  if (!LATIN.test(first)) return first;
  const words = text.split(/[\s._\-/]+|(?<=\p{Ll})(?=\p{Lu})/u).filter((word) => word !== '');
  const letters =
    words.length > 1 ? [...words[0]!][0]! + [...words[1]!][0]! : [...text].slice(0, 2).join('');
  return letters.toUpperCase();
}

export const FOLDER_COLOR_IDS = HOST_COLOR_IDS.filter((id) => id !== 'graphite');
const FOLDER_COLOR_STEP = 4;

function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (const char of text) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

export function folderColor(name: string | undefined): HostColorId {
  return FOLDER_COLOR_IDS[fnv1a(name ?? '') % FOLDER_COLOR_IDS.length]!;
}

export function folderColorKey(hostId: string, folderName: string | undefined): string {
  return `${hostId}\u0000${folderName ?? ''}`;
}

export function assignFolderColors(
  entries: readonly { hostId: string; folderName?: string | undefined }[],
): Map<string, HostColorId> {
  const byHost = new Map<string, Set<string>>();
  for (const { hostId, folderName } of entries) {
    if (folderName === undefined || folderName === '') continue;
    const names = byHost.get(hostId) ?? new Set<string>();
    names.add(folderName);
    byHost.set(hostId, names);
  }
  const count = FOLDER_COLOR_IDS.length;
  const colors = new Map<string, HostColorId>();
  for (const [hostId, names] of byHost) {
    const used = new Set<number>();
    for (const name of [...names].sort()) {
      let index = fnv1a(name) % count;
      if (used.size < count)
        for (let probe = 0; probe < count && used.has(index); probe += 1)
          index = (index + FOLDER_COLOR_STEP) % count;
      used.add(index);
      colors.set(folderColorKey(hostId, name), FOLDER_COLOR_IDS[index]!);
    }
  }
  return colors;
}
