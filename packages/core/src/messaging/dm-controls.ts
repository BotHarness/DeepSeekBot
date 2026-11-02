import type { DatabaseSync } from 'node:sqlite';
import type { MessagingGrant } from './outbound.js';

export function effectiveDmControls(db: DatabaseSync, value: MessagingGrant): MessagingGrant {
  if (value.receiveScope?.kind !== 'dm') return value;
  const rows = db
    .prepare('SELECT body FROM messaging_grants WHERE binding_id = ?')
    .all(value.bindingId);
  let selected: MessagingGrant | undefined;
  for (const row of rows) {
    const candidate = JSON.parse(String(row.body)) as MessagingGrant;
    if (
      candidate.receiveScope?.kind === 'dm' &&
      candidate.receiveScope.conversationId === value.receiveScope.conversationId &&
      (candidate.dmSyncRevision ?? 0) > (selected?.dmSyncRevision ?? 0)
    )
      selected = candidate;
  }
  return {
    ...value,
    dmMirror: selected?.dmMirror === true,
    dmForward: selected?.dmForward === true,
    dmSyncRevision: selected?.dmSyncRevision ?? 0,
    ...(selected?.dmForwardAfter ? { dmForwardAfter: selected.dmForwardAfter } : {}),
    ...(selected?.dmMirrorEpoch ? { dmMirrorEpoch: selected.dmMirrorEpoch } : {}),
  };
}
