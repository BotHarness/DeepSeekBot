import type {
  MessagingConnection,
  MessagingConnectionsView,
} from '@botharness/host-protocol/messaging-connections';
import type { TagTone } from '../ds/tag.js';
import type { BotHarnessKey } from '../locale.js';

export interface ConnectionStatus {
  readonly label: BotHarnessKey;
  readonly tone: TagTone;
}

export function connectionStatus(
  row: MessagingConnection,
  checks: MessagingConnectionsView['checks'],
): ConnectionStatus {
  if (!row.enabled || row.availability === 'paused')
    return { label: 'identity.state.paused', tone: 'quiet' };
  if (checks === 'pending') return { label: 'im.checking', tone: 'quiet' };
  if (row.availability === 'rebind-required')
    return { label: 'identity.state.rebind-required', tone: 'danger' };
  if (row.availability === 'unavailable')
    return { label: 'identity.state.unavailable', tone: 'danger' };
  if (row.recovery?.kind === 'action-required')
    return { label: 'reception.actionRequired', tone: 'danger' };
  if (row.recovery?.kind === 'retrying') return { label: 'reception.retrying', tone: 'warning' };
  if (row.reception === 'receiving') return { label: 'reception.receiving', tone: 'success' };
  if (row.reception === 'connecting') return { label: 'reception.connecting', tone: 'info' };
  if (row.reception === 'unavailable')
    return { label: 'reception.actionRequired', tone: 'warning' };
  return { label: 'reception.off', tone: 'quiet' };
}

export interface BotConnections {
  readonly botSlug: string;
  readonly botName: string;
  readonly rows: readonly MessagingConnection[];
}

export function groupByBot(rows: readonly MessagingConnection[]): readonly BotConnections[] {
  const groups = new Map<
    string,
    { botSlug: string; botName: string; rows: MessagingConnection[] }
  >();
  for (const row of rows) {
    const group = groups.get(row.botSlug);
    if (group === undefined)
      groups.set(row.botSlug, { botSlug: row.botSlug, botName: row.botName, rows: [row] });
    else group.rows.push(row);
  }
  return [...groups.values()].sort((left, right) => left.botName.localeCompare(right.botName));
}
