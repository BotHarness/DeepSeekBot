export interface RosterSection {
  id: string;
  name: string;
  channelIds: string[];
}

export interface TopOrderEntry {
  kind: 'section' | 'channel';
  id: string;
}

export interface RosterSnapshot {
  pins: string[];
  hidden: string[];
  muted: string[];
  sections: RosterSection[];
  topOrder: TopOrderEntry[] | undefined;
}

export function emptyRosterSnapshot(): RosterSnapshot {
  return { pins: [], hidden: [], muted: [], sections: [], topOrder: undefined };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

export function uniqueStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string' || entry.length === 0 || seen.has(entry)) continue;
    seen.add(entry);
    result.push(entry);
  }
  return result;
}

export function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

export function reconcileOrder(preferred: readonly string[], members: readonly string[]): string[] {
  const known = new Set(members);
  const next: string[] = [];
  const seen = new Set<string>();
  for (const id of preferred) {
    if (!known.has(id) || seen.has(id)) continue;
    seen.add(id);
    next.push(id);
  }
  for (const id of members) {
    if (seen.has(id)) continue;
    seen.add(id);
    next.push(id);
  }
  return next;
}

export function planSectionChannelOrder(
  section: RosterSection,
  order: readonly string[],
): string[] | undefined {
  const target = reconcileOrder(order, section.channelIds);
  return sameIds(target, section.channelIds) ? undefined : target;
}

export function parseRosterSection(value: unknown): RosterSection | undefined {
  const record = asRecord(value);
  if (record === undefined) return undefined;
  const id = record['id'];
  const name = record['name'];
  if (typeof id !== 'string' || id.length === 0) return undefined;
  if (typeof name !== 'string') return undefined;
  return { id, name, channelIds: uniqueStrings(record['channelIds']) };
}

export function parseRosterSnapshot(value: unknown): RosterSnapshot {
  const record = asRecord(value);
  if (record === undefined) return emptyRosterSnapshot();
  const sections: RosterSection[] = [];
  const seen = new Set<string>();
  if (Array.isArray(record['sections'])) {
    for (const entry of record['sections']) {
      const section = parseRosterSection(entry);
      if (section === undefined || seen.has(section.id)) continue;
      seen.add(section.id);
      sections.push(section);
    }
  }
  return {
    pins: uniqueStrings(record['pins']),
    hidden: uniqueStrings(record['hidden']),
    muted: uniqueStrings(record['muted']),
    sections,
    topOrder: parseTopOrder(record),
  };
}

export function parseTopOrderEntry(value: unknown): TopOrderEntry | undefined {
  const record = asRecord(value);
  if (record === undefined) return undefined;
  const kind = record['kind'];
  const id = record['id'];
  if (kind !== 'section' && kind !== 'channel') return undefined;
  if (typeof id !== 'string' || id.length === 0) return undefined;
  return { kind, id };
}

function parseTopOrder(record: Record<string, unknown>): TopOrderEntry[] | undefined {
  const value = record['topOrder'];
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return undefined;
  const entries: TopOrderEntry[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const entry = parseTopOrderEntry(item);
    if (entry === undefined) continue;
    const key = `${entry.kind}:${entry.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push(entry);
  }
  return entries;
}
