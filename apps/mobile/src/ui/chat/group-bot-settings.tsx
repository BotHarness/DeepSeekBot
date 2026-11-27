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
import { SettingsRow, SettingsSection } from '../primitives/settings-row';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';
import type { ProfileRow, ProfileTabBody } from './profile-shell';

const options = ['everyone', 'roles', 'admins'] as const;
const ON = 'raised' as const;

export function useGroupBotSettings(
  client: HostClient | undefined,
  channelId: string,
  active: boolean,
): { mount: (node: ViewInstance | null) => void; body: ProfileTabBody } {
  const t = useStrings();
  const [view, setView] = useState<ChannelBotsView>();
  const [readFailed, setReadFailed] = useState(false);
  const [writeFailed, setWriteFailed] = useState(false);
  const [readAttempt, setReadAttempt] = useState(0);
  const [pending, setPending] = useState(false);
  const [selected, setSelected] = useState<string>();
  const [draft, setDraft] = useState<ChannelBotAudience>();
  const writing = useRef(false);
  const latestSave = useRef(0);
  const mount = useMounted<ViewInstance>(() => {
    if (!active || !client) return;
    let live = true;
    const unfollow = followConnection(client, async () => {
      const started = latestSave.current;
      try {
        const value = await channelBotSettings(client, channelId);
        if (live && started === latestSave.current) {
          setView(value);
          setReadFailed(false);
        }
      } catch (error) {
        if (live && started === latestSave.current) setReadFailed(true);
        throw error;
      }
    });
    return () => {
      live = false;
      unfollow();
    };
  }, [active, client, channelId, readAttempt]);
  const bot = view?.bots.find((entry) => entry.botSlug === selected);
  const save = async (change: ChannelBotChange) => {
    if (bot === undefined || !client || writing.current) return;
    writing.current = true;
    setPending(true);
    setWriteFailed(false);
    try {
      const value = await channelBotSettings(client, channelId, { botSlug: bot.botSlug, change });
      latestSave.current += 1;
      setView(value);
      setReadFailed(false);
      if (change.kind === 'audience') setDraft(undefined);
    } catch {
      setWriteFailed(true);
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
  if (readFailed || writeFailed)
    add('error', () => <Text tone="danger">{t.channelBots.unavailable}</Text>);
  if (readFailed)
    add('retry', () => (
      <SettingsRow
        title={t.retry}
        onPress={() => {
          setReadFailed(false);
          setReadAttempt((attempt) => attempt + 1);
        }}
      />
    ));
  if (!view && !readFailed) add('loading', () => <LoadingIndicator />);
  if (view?.bots.length === 0) add('empty', () => <Text tone="muted">{t.channelBots.empty}</Text>);
  if (!bot && (view?.bots.length ?? 0) > 0)
    add('bots', () => (
      <SettingsSection title={t.profileSettingsBot} on={ON}>
        {(view?.bots ?? []).map((entry) => (
          <SettingsRow
            key={entry.botSlug}
            on={ON}
            title={entry.name}
            detail={t.channelBots[entry.audience.kind]}
            control={{ kind: 'chevron' }}
            testID={`channel-bot-${entry.botSlug}`}
            onPress={() => chooseBot(entry.botSlug)}
          />
        ))}
      </SettingsSection>
    ));
  if (bot) {
    const audience = draft ?? bot.audience;
    const canSave = draft !== undefined && (draft.kind !== 'roles' || draft.roleIds.length > 0);
    add('back', () => (
      <SettingsSection on={ON}>
        <SettingsRow
          on={ON}
          title={t.back}
          detail={bot.name}
          testID="channel-bot-back"
          onPress={() => chooseBot(undefined)}
        />
      </SettingsSection>
    ));
    add('audience', () => (
      <SettingsSection title={t.channelBots.audience} footer={t.channelBots.intersection} on={ON}>
        {bot.canSetAudience ? (
          options.map((kind) => (
            <SettingsRow
              key={kind}
              on={ON}
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
          ))
        ) : (
          <SettingsRow
            on={ON}
            title={t.channelBots.audience}
            control={{ kind: 'value', text: t.channelBots[bot.audience.kind] }}
          />
        )}
      </SettingsSection>
    ));
    if (bot.canSetAudience && audience.kind === 'roles' && (view?.roles.length ?? 0) > 0)
      add('roles', () => (
        <SettingsSection title={t.channelBots.roles} on={ON}>
          {(view?.roles ?? []).map((role) => {
            const checked = audience.roleIds.includes(role.roleId);
            return (
              <SettingsRow
                key={role.roleId}
                on={ON}
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
            );
          })}
        </SettingsSection>
      ));
    if (canSave)
      add('save', () => (
        <SettingsSection on={ON}>
          <SettingsRow
            on={ON}
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
        </SettingsSection>
      ));
    const people = new Map(
      (view?.members ?? []).map(({ humanId, displayName }) => [humanId, displayName]),
    );
    for (const id of bot.blockedHumanIds) if (!people.has(id)) people.set(id, id);
    if (people.size > 0)
      add('blocks', () => (
        <SettingsSection title={t.channelBots.blocks} on={ON}>
          {[...people].map(([humanId, displayName]) => (
            <SettingsRow
              key={humanId}
              on={ON}
              title={displayName}
              control={{
                kind: 'switch',
                value: bot.blockedHumanIds.includes(humanId),
                disabled: pending,
                testID: `channel-bot-block-${humanId}`,
                onChange: (next) => {
                  void save({ kind: 'block', humanId, blocked: next });
                },
              }}
            />
          ))}
        </SettingsSection>
      ));
  }
  return { mount, body: { rows } };
}
