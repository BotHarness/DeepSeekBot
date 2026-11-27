import type {
  ChannelBotAudience,
  ChannelBotChange,
  ChannelBotsView,
} from '@botharness/host-protocol/channel-bots';
import { answerRecord, HostAnswerInvalid, record, strings, type HostCall } from './host-answer';

function parseRows<T>(value: unknown, parse: (row: Record<string, unknown>) => T | undefined): T[] {
  if (!Array.isArray(value))
    throw new HostAnswerInvalid('Channel Bot settings returned an invalid list.');
  return value.map((entry) => {
    const row = record(entry);
    const parsed = row && parse(row);
    if (parsed === undefined)
      throw new HostAnswerInvalid('Channel Bot settings returned an invalid row.');
    return parsed;
  });
}

function parseAudience(value: unknown): ChannelBotAudience | undefined {
  const row = record(value);
  if (row?.kind === 'everyone' || row?.kind === 'admins') return { kind: row.kind };
  if (row?.kind === 'roles' && strings(row.roleIds)) return { kind: 'roles', roleIds: row.roleIds };
  return undefined;
}

export async function channelBotSettings(
  host: HostCall,
  channelId: string,
  update?: { botSlug: string; change: ChannelBotChange },
): Promise<ChannelBotsView> {
  const value = answerRecord(
    await host.call('channelBotSettings', { channelId, ...update }),
    'channelBotSettings',
  );
  return {
    bots: parseRows(value.bots, (row) => {
      const { botSlug, name, canSetAudience, blockedHumanIds } = row;
      const audience = parseAudience(row.audience);
      if (
        typeof botSlug === 'string' &&
        typeof name === 'string' &&
        typeof canSetAudience === 'boolean' &&
        strings(blockedHumanIds) &&
        audience
      )
        return { botSlug, name, canSetAudience, blockedHumanIds, audience };
      return undefined;
    }),
    roles: parseRows(value.roles, ({ roleId, name }) =>
      typeof roleId === 'string' && typeof name === 'string' ? { roleId, name } : undefined,
    ),
    members: parseRows(value.members, ({ humanId, displayName }) =>
      typeof humanId === 'string' && typeof displayName === 'string'
        ? { humanId, displayName }
        : undefined,
    ),
  };
}
