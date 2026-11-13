import type { ChannelSummary } from './store.js';
import type { RemoteHost, RemoteConversationTarget } from './remote-hosts.js';
export function remoteChannelRows(remote: RemoteHost): (RemoteConversationTarget & {
  key: string;
  unread: number;
  preview?: string;
  previewAt?: string;
})[] {
  const roster = remote.snapshot.roster;
  if (roster === undefined) return [];
  const hostId = remote.host.hostId;
  const unread = remote.inbox.status === 'ready' ? (remote.inbox.unread ?? {}) : {};
  const hidden = new Set(roster.arrangement?.hidden ?? []);
  return [
    ...roster.bots
      .filter((bot) => !hidden.has(bot.dmChannelId ?? ''))
      .map((bot) => ({
        key: `bot:${bot.slug}`,
        hostId,
        title: bot.displayName,
        botSlug: bot.slug,
        unread: bot.dmChannelId === undefined ? 0 : (unread[bot.dmChannelId] ?? 0),
        ...(bot.preview === undefined ? {} : { preview: bot.preview }),
        ...(bot.previewAt === undefined ? {} : { previewAt: bot.previewAt }),
      })),
    ...roster.channels
      .filter((channel) => !hidden.has(channel.id))
      .map((channel) => ({
        key: `channel:${channel.id}`,
        hostId,
        title: channel.name,
        channelId: channel.id,
        unread: unread[channel.id] ?? 0,
        ...(channel.preview === undefined ? {} : { preview: channel.preview }),
        ...(channel.previewAt === undefined ? {} : { previewAt: channel.previewAt }),
      })),
  ].sort(
    (a, b) => (b.previewAt ?? '').localeCompare(a.previewAt ?? '') || a.key.localeCompare(b.key),
  );
}

export type EnvironmentChannel =
  | { kind: 'local'; key: string; at: string; channel: ChannelSummary }
  | {
      kind: 'remote';
      key: string;
      at: string;
      remote: RemoteHost;
      row: ReturnType<typeof remoteChannelRows>[number];
    };

export function mixedEnvironmentChannels(
  local: readonly ChannelSummary[],
  hosts: readonly RemoteHost[],
  query: string,
): EnvironmentChannel[] {
  const needle = query.trim().toLocaleLowerCase();
  return [
    ...local.map((channel): EnvironmentChannel => ({
      kind: 'local',
      key: JSON.stringify(['local', channel.id]),
      at: channel.latestMessage?.at ?? '',
      channel,
    })),
    ...hosts.flatMap((remote) =>
      remoteChannelRows(remote)
        .filter((row) => !needle || row.title.toLocaleLowerCase().includes(needle))
        .map((row): EnvironmentChannel => ({
          kind: 'remote',
          key: JSON.stringify([row.hostId, row.key]),
          at: row.previewAt ?? '',
          remote,
          row,
        })),
    ),
  ].sort((a, b) => b.at.localeCompare(a.at) || a.key.localeCompare(b.key));
}
