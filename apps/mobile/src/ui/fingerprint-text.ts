const GROUP = /.{1,4}/gu;
const GROUPS_PER_ROW = 4;

export function fingerprintGroups(fingerprint: string): string[] {
  return fingerprint.replace(/\s+/gu, '').match(GROUP) ?? [];
}

export function fingerprintText(fingerprint: string): string {
  return fingerprintGroups(fingerprint).join(' ');
}

export function fingerprintRows(fingerprint: string): string[] {
  const groups = fingerprintGroups(fingerprint);
  const rows: string[] = [];
  for (let start = 0; start < groups.length; start += GROUPS_PER_ROW)
    rows.push(groups.slice(start, start + GROUPS_PER_ROW).join(' '));
  return rows;
}
