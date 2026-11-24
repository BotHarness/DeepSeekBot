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

export function folderColorIndex(name: string | undefined, count: number): number {
  let hash = 0;
  for (const char of name ?? '') hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  return hash % count;
}
