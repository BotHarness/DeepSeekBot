import { useMemo, useRef, useState } from 'react';

import { composerSessionOptions, type ComposerSessionOption } from './session-refs.js';
import type { BotSummary, ChannelSummary, OwnedSessionSummary } from './store.js';

type GroupSessions = Readonly<Record<string, readonly OwnedSessionSummary[]>>;

const FRESH_MS = 15_000;

export function useComposerSessionOptions({
  channel,
  bots,
  dmSessions,
  readSessions,
  refreshDmSessions,
}: {
  channel: ChannelSummary | undefined;
  bots: readonly BotSummary[];
  dmSessions: readonly OwnedSessionSummary[];
  readSessions: (slug: string) => Promise<OwnedSessionSummary[]>;
  refreshDmSessions: (slug: string) => Promise<void>;
}): { options: readonly ComposerSessionOption[]; refresh: () => void } {
  const [group, setGroup] = useState<{ channelId: string; sessions: GroupSessions }>();
  const loaded = useRef<{ key: string; at: number }>(undefined);
  const dmSlug = channel?.type === 'dm' ? channel.botSlug : undefined;
  const groupId = channel?.type === 'group' ? channel.id : undefined;
  const members =
    channel?.type === 'group'
      ? channel.members.filter((slug) =>
          bots.some((bot) => bot.slug === slug && bot.deleted !== true),
        )
      : [];
  const key = dmSlug ?? (groupId === undefined ? '' : groupId + ':' + members.join(','));
  const refresh = (): void => {
    if (key === '') return;
    const now = Date.now();
    if (loaded.current?.key === key && now - loaded.current.at < FRESH_MS) return;
    loaded.current = { key, at: now };
    if (dmSlug !== undefined) {
      void refreshDmSessions(dmSlug).catch(() => undefined);
      return;
    }
    if (groupId === undefined) return;
    void Promise.all(
      members.map(async (slug) => {
        try {
          return [slug, await readSessions(slug)] as const;
        } catch {
          return [slug, []] as const;
        }
      }),
    ).then((entries) => {
      if (loaded.current?.key === key)
        setGroup({ channelId: groupId, sessions: Object.fromEntries(entries) });
    });
  };
  const options = useMemo(() => {
    if (dmSlug !== undefined)
      return composerSessionOptions([
        { botSlug: dmSlug, bot: bots.find((bot) => bot.slug === dmSlug), items: dmSessions },
      ]);
    if (group === undefined || group.channelId !== groupId) return [];
    return composerSessionOptions(
      Object.entries(group.sessions).map(([slug, items]) => ({
        botSlug: slug,
        bot: bots.find((bot) => bot.slug === slug),
        items,
      })),
    );
  }, [dmSlug, dmSessions, group, groupId, bots]);
  return { options, refresh };
}
