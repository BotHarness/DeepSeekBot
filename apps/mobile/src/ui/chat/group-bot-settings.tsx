import { useRef, useState, type ReactNode } from 'react';
import { View, type ViewInstance } from 'react-native';
import { channelBotSettings } from '@botharness/host-client/channel-bots';
import type { HostClient } from '@botharness/host-client/client';
import type {
  ChannelBotAudience,
  ChannelBotChange,
  ChannelBotsView,
} from '@botharness/host-protocol/channel-bots';
import {
  readChannelApprovalRules,
  setChannelApprovalRule,
  type ChannelApprovalChoice,
  type ChannelApprovalKey,
  type ChannelApprovalRules,
} from '@botharness/host-client/channel-approvals';
import { followConnection } from '../../host/follow-connection';
import { PreferenceRow } from '../primitives/preference-row';
import { useMounted } from '../mounted';
import { LoadingIndicator } from '../primitives/loading-indicator';
import {
  SettingsFooter,
  SettingsGroupItem,
  SettingsHeading,
  SettingsRow,
} from '../primitives/settings-row';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';
import { space } from '../design/tokens';
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
  const [rules, setRules] = useState<ChannelApprovalRules>();
  const [rulesBusy, setRulesBusy] = useState(false);
  const [rulesFailed, setRulesFailed] = useState(false);
  const mount = useMounted<ViewInstance>(() => {
    if (!active || !client) return;
    let live = true;
    const unfollow = followConnection(client, async () => {
      const started = latestSave.current;
      void readChannelApprovalRules(client, channelId).then(
        (next) => {
          if (live) setRules(next);
        },
        () => {
          if (live) setRules(undefined);
        },
      );
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
  const heading = (key: string, title: string) =>
    add(key, () => (
      <View style={{ paddingTop: space.x4, paddingBottom: space.x2 }}>
        <SettingsHeading>{title}</SettingsHeading>
      </View>
    ));
  const footer = (key: string, text: string) =>
    add(key, () => (
      <View style={{ paddingTop: space.x2 }}>
        <SettingsFooter>{text}</SettingsFooter>
      </View>
    ));
  const group = <T,>(items: readonly T[], key: (item: T) => string, row: (item: T) => ReactNode) =>
    items.forEach((item, index) =>
      add(key(item), () => (
        <SettingsGroupItem first={index === 0} last={index === items.length - 1} on={ON}>
          {row(item)}
        </SettingsGroupItem>
      )),
    );
  const saveRule = async (key: ChannelApprovalKey, value: ChannelApprovalChoice) => {
    if (!client || rules === undefined || rulesBusy) return;
    setRulesBusy(true);
    setRulesFailed(false);
    try {
      await setChannelApprovalRule(client, channelId, rules, key, value);
      setRules(await readChannelApprovalRules(client, channelId));
    } catch {
      setRulesFailed(true);
      setRules(await readChannelApprovalRules(client, channelId).catch(() => rules));
    } finally {
      setRulesBusy(false);
    }
  };
  if (!bot && (view?.bots.length ?? 0) > 0) {
    heading('bots:heading', t.profileSettingsBot);
    group(
      view?.bots ?? [],
      (entry) => `bot:${entry.botSlug}`,
      (entry) => (
        <SettingsRow
          on={ON}
          title={entry.name}
          detail={t.channelBots[entry.audience.kind]}
          control={{ kind: 'chevron' }}
          testID={`channel-bot-${entry.botSlug}`}
          onPress={() => chooseBot(entry.botSlug)}
        />
      ),
    );
  }
  if (bot) {
    const audience = draft ?? bot.audience;
    const canSave = draft !== undefined && (draft.kind !== 'roles' || draft.roleIds.length > 0);
    group(
      ['back'],
      () => 'back',
      () => (
        <SettingsRow
          on={ON}
          title={t.back}
          detail={bot.name}
          testID="channel-bot-back"
          onPress={() => chooseBot(undefined)}
        />
      ),
    );
    heading('audience:heading', t.channelBots.audience);
    if (bot.canSetAudience)
      group(
        options,
        (kind) => `audience:${kind}`,
        (kind) => (
          <SettingsRow
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
        ),
      );
    else
      group(
        ['audience'],
        () => 'audience',
        () => (
          <SettingsRow
            on={ON}
            title={t.channelBots.audience}
            control={{ kind: 'value', text: t.channelBots[bot.audience.kind] }}
          />
        ),
      );
    footer('audience:footer', t.channelBots.intersection);
    if (bot.canSetAudience && audience.kind === 'roles' && (view?.roles.length ?? 0) > 0) {
      heading('roles:heading', t.channelBots.roles);
      group(
        view?.roles ?? [],
        (role) => `role:${role.roleId}`,
        (role) => {
          const checked = audience.roleIds.includes(role.roleId);
          return (
            <SettingsRow
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
        },
      );
    }
    if (canSave)
      group(
        ['save'],
        () => 'save',
        () => (
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
        ),
      );
    const people = new Map(
      (view?.members ?? []).map(({ humanId, displayName }) => [humanId, displayName]),
    );
    for (const id of bot.blockedHumanIds) if (!people.has(id)) people.set(id, id);
    if (people.size > 0) {
      heading('blocks:heading', t.channelBots.blocks);
      group(
        [...people],
        ([humanId]) => `human:${humanId}`,
        ([humanId, displayName]) => (
          <SettingsRow
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
        ),
      );
    }
  }
  if (!bot && rules !== undefined) {
    const a = t.channelApprovals;
    const labels = {
      seeApprovals: { allow: a.everyone, deny: a.tableOnly },
      decideApprovals: { allow: a.everyone, deny: a.ownersAndTable },
    } as const;
    heading('approvals:heading', a.title);
    group(
      [
        ['seeApprovals', a.see, rules.see],
        ['decideApprovals', a.decide, rules.decide],
      ] as const,
      ([key]) => `approvals:${key}`,
      ([key, title, value]) =>
        rules.manager ? (
          <PreferenceRow
            on={ON}
            title={title}
            testID={`channel-approvals-${key}`}
            value={value}
            options={[
              { value: 'allow', label: labels[key].allow },
              { value: 'deny', label: labels[key].deny },
            ]}
            onChange={(next) => void saveRule(key, next)}
          />
        ) : (
          <SettingsRow
            on={ON}
            title={title}
            control={{ kind: 'value', text: labels[key][value] }}
          />
        ),
    );
    group(
      ['unhandled'],
      () => 'approvals:unhandled',
      () => (
        <SettingsRow
          on={ON}
          title={a.unhandled}
          control={{ kind: 'value', text: a.unhandledValue }}
        />
      ),
    );
    if (rulesFailed) add('approvals:error', () => <Text tone="danger">{a.saveFailed}</Text>);
    footer(
      'approvals:footer',
      !rules.manager ? a.managersOnly : rules.mode === 'legacy' ? a.legacy : a.byRole,
    );
  }
  return { mount, body: { rows } };
}
