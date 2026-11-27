import { useRef, useState, type ReactNode } from 'react';
import type { ViewInstance } from 'react-native';
import { channelBotSettings } from '@botharness/host-client/channel-bots';
import type { HostClient } from '@botharness/host-client/client';
import type {
  ChannelBotAudience,
  ChannelBotChange,
  ChannelBotsView,
} from '@botharness/host-protocol/channel-bots';
import { followConnection } from '../../host/follow-connection';
import { useMounted } from '../mounted';
import { LoadingIndicator } from '../primitives/loading-indicator';
import { SettingsRow } from '../primitives/settings-row';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';
import type { ProfileRow, ProfileTabBody } from './profile-shell';

const options = ['everyone', 'roles', 'admins'] as const;

export function useGroupBotSettings(
  client: HostClient | undefined,
  channelId: string,
  active: boolean,
): { mount: (node: ViewInstance | null) => void; body: ProfileTabBody } {
  const t = useStrings();
  const [view, setView] = useState<ChannelBotsView>();
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState(false);
  const [selected, setSelected] = useState<string>();
  const [draft, setDraft] = useState<ChannelBotAudience>();
  const writing = useRef(false);
  const mount = useMounted<ViewInstance>(() => {
    if (!active || !client) return;
    let live = true;
    const unfollow = followConnection(client, async () => {
      try {
        const value = await channelBotSettings(client, channelId);
        if (live) {
          setView(value);
          setFailed(false);
        }
      } catch (error) {
        if (live) setFailed(true);
        throw error;
      }
    });
    return () => {
      live = false;
      unfollow();
    };
  }, [active, client, channelId]);
  const bot = view?.bots.find((entry) => entry.botSlug === selected);
  const save = async (change: ChannelBotChange) => {
    if (bot === undefined || !client || writing.current) return;
    writing.current = true;
    setPending(true);
    setFailed(false);
    try {
      setView(await channelBotSettings(client, channelId, { botSlug: bot.botSlug, change }));
      if (change.kind === 'audience') setDraft(undefined);
    } catch {
      setFailed(true);
    } finally {
      writing.current = false;
      setPending(false);
    }
  };
  const chooseBot = (slug: string | undefined) => {
    if (writing.current) return;
    setDraft(undefined);
    setSelected(slug);
  };
  const rows: ProfileRow[] = [];
  const add = (key: string, render: () => ReactNode) => rows.push({ key, render });
  if (failed) add('error', () => <Text tone="danger">{t.channelBots.unavailable}</Text>);
  if (!view && !failed) add('loading', () => <LoadingIndicator />);
  if (view?.bots.length === 0) add('empty', () => <Text tone="muted">{t.channelBots.empty}</Text>);
  if (!bot) {
    for (const entry of view?.bots ?? [])
      add(`bot:${entry.botSlug}`, () => (
        <SettingsRow
          title={entry.name}
          control={{ kind: 'chevron' }}
          testID={`channel-bot-${entry.botSlug}`}
          onPress={() => chooseBot(entry.botSlug)}
        />
      ));
  } else {
    const audience = draft ?? bot.audience;
    add('back', () => (
      <SettingsRow
        title={t.back}
        detail={bot.name}
        testID="channel-bot-back"
        onPress={() => chooseBot(undefined)}
      />
    ));
    add('audience', () => (
      <SettingsRow
        title={t.channelBots.audience}
        detail={t.channelBots.intersection}
        control={{ kind: 'value', text: t.channelBots[bot.audience.kind] }}
      />
    ));
    if (bot.canSetAudience) {
      for (const kind of options)
        add(kind, () => (
          <SettingsRow
            title={t.channelBots[kind]}
            selected={audience.kind === kind}
            control={audience.kind === kind ? { kind: 'check' } : undefined}
            testID={`channel-bot-audience-${kind}`}
            onPress={
              pending
                ? undefined
                : () =>
                    setDraft(
                      kind === 'roles'
                        ? {
                            kind,
                            roleIds: bot.audience.kind === 'roles' ? bot.audience.roleIds : [],
                          }
                        : { kind },
                    )
            }
          />
        ));
      if (audience.kind === 'roles')
        for (const role of view?.roles ?? []) {
          const checked = audience.roleIds.includes(role.roleId);
          add(`role:${role.roleId}`, () => (
            <SettingsRow
              title={role.name}
              control={{
                kind: 'switch',
                value: checked,
                disabled: pending,
                testID: `channel-bot-role-${role.roleId}`,
                onChange: (next) =>
                  setDraft({
                    kind: 'roles',
                    roleIds: next
                      ? [...audience.roleIds, role.roleId]
                      : audience.roleIds.filter((id) => id !== role.roleId),
                  }),
              }}
            />
          ));
        }
      if (draft && (draft.kind !== 'roles' || draft.roleIds.length > 0))
        add('save', () => (
          <SettingsRow
            title={t.groupRenameSave}
            testID="channel-bot-save"
            control={pending ? { kind: 'busy' } : undefined}
            onPress={
              pending
                ? undefined
                : () => {
                    void save({ kind: 'audience', audience: draft });
                  }
            }
          />
        ));
    }
    add('blocks', () => <Text>{t.channelBots.blocks}</Text>);
    const people = new Map(
      (view?.members ?? []).map(({ humanId, displayName }) => [humanId, displayName]),
    );
    for (const id of bot.blockedHumanIds) if (!people.has(id)) people.set(id, id);
    for (const [humanId, displayName] of people) {
      const blocked = bot.blockedHumanIds.includes(humanId);
      add(`human:${humanId}`, () => (
        <SettingsRow
          title={displayName}
          control={{
            kind: 'switch',
            value: blocked,
            disabled: pending,
            testID: `channel-bot-block-${humanId}`,
            onChange: (next) => {
              void save({ kind: 'block', humanId, blocked: next });
            },
          }}
        />
      ));
    }
  }
  return { mount, body: { rows } };
}
