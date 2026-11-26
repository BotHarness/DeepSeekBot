import { useRef, useState } from 'react';
import { ScrollView, View, type ScrollViewInstance } from 'react-native';

import { botAccess, setBotAccess, type BotAccess, type BotAccessKind } from '../../host/bot-access';
import {
  MANAGEMENT_CAPABILITIES,
  loadManagementGrants,
  setManagementGrant,
  type ManagementCapability,
  type ManagementGrants,
} from '@botharness/host-client/management-grants';
import { confirmAppDialog } from '../primitives/app-dialog';
import { errorText, HostAnswerInvalid } from '@botharness/host-client/bot-settings';
import type { HostClient, RosterBot } from '@botharness/host-client/client';
import { useDesignTheme } from '../design/theme';
import { edge, space } from '../design/tokens';
import {
  SettingsFooter,
  SettingsHeading,
  SettingsRow,
  SettingsSection,
} from '../primitives/settings-row';
import { Text } from '../primitives/text';
import { useMounted } from '../mounted';
import { useStrings } from '../strings';
import { SHEET_GROUP } from './sheet';

const KINDS: readonly BotAccessKind[] = ['browser', 'computer'];

export function useBotAccessSwitches(client: HostClient, bot: RosterBot) {
  const host = botAccess(bot);
  const [chosen, setChosen] = useState<Partial<BotAccess>>({});
  const [error, setError] = useState<string>();
  const saving = useRef(new Set<BotAccessKind>());
  const settled = KINDS.filter((kind) => chosen[kind] === host[kind] && !saving.current.has(kind));
  if (settled.length > 0)
    setChosen((current) => {
      const next = { ...current };
      for (const kind of settled) delete next[kind];
      return next;
    });
  const value = (kind: BotAccessKind) => chosen[kind] ?? host[kind];
  const change = async (kind: BotAccessKind, enabled: boolean) => {
    if (saving.current.has(kind)) return;
    saving.current.add(kind);
    setError(undefined);
    setChosen((current) => ({ ...current, [kind]: enabled }));
    try {
      const saved = await setBotAccess(client, bot.slug, kind, enabled);
      saving.current.delete(kind);
      setChosen((current) => ({ ...current, [kind]: saved }));
    } catch (failure) {
      saving.current.delete(kind);
      setChosen((current) => {
        const next = { ...current };
        delete next[kind];
        return next;
      });
      setError(failure instanceof HostAnswerInvalid ? '' : errorText(failure));
    }
  };
  return { value, change, error };
}

export function useManagementGrants(client: HostClient, bot: RosterBot) {
  const strings = useStrings();
  const [grants, setGrants] = useState<ManagementGrants>();
  const [noAppManager, setNoAppManager] = useState(false);
  const [error, setError] = useState<string>();
  const busy = useRef(false);
  const mount = useMounted<ScrollViewInstance>(() => {
    let live = true;
    setGrants(undefined);
    loadManagementGrants(client, bot.slug).then(
      (value) => {
        if (live) setGrants(value);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [client, bot.slug]);
  const change = async (capability: ManagementCapability, enabled: boolean) => {
    if (busy.current) return;
    const copy = strings.profilePermissions;
    if (
      enabled &&
      !(await confirmAppDialog(
        copy[`${capability}Confirm`](bot.displayName),
        `${copy[`${capability}Detail`](bot.displayName)} ${copy.managementApproval}`,
        copy.turnOn,
      ))
    )
      return;
    busy.current = true;
    setError(undefined);
    try {
      const saved = await setManagementGrant(client, bot.slug, capability, enabled);
      setGrants((current) =>
        current === undefined ? current : { ...current, capabilities: saved.capabilities },
      );
      setNoAppManager(saved.noAppManager);
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      busy.current = false;
    }
  };
  return { mount, grants, noAppManager, error, change };
}

export function BotAccessScreen({ client, bot }: { client: HostClient; bot: RosterBot }) {
  const t = useStrings();
  const theme = useDesignTheme();
  const access = useBotAccessSwitches(client, bot);
  const management = useManagementGrants(client, bot);
  const copy = t.profilePermissions;
  const row = (kind: BotAccessKind, index: number) => (
    <View
      key={kind}
      style={
        index === 0
          ? undefined
          : {
              borderTopWidth: edge.hairline,
              borderTopColor: theme.layer[SHEET_GROUP].divider,
            }
      }
    >
      <SettingsRow
        on={SHEET_GROUP}
        title={copy[kind]}
        detail={
          kind === 'browser'
            ? copy.browserDetail(bot.displayName)
            : copy.computerDetail(bot.displayName)
        }
        icon={kind}
        control={{
          kind: 'switch',
          value: access.value(kind),
          onChange: (enabled) => void access.change(kind, enabled),
          testID: `bot-access-${kind}`,
        }}
      />
    </View>
  );
  return (
    <ScrollView
      ref={management.mount}
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: theme.overlay.fill }}
      contentContainerStyle={{ padding: space.x5, gap: space.x4 }}
    >
      <SettingsSection on={SHEET_GROUP}>{KINDS.map(row)}</SettingsSection>
      {access.error === undefined ? null : (
        <Text accessibilityRole="alert" tone="danger">
          {access.error === '' ? copy.accessRetry : copy.accessFailed(access.error)}
        </Text>
      )}
      {management.grants?.editable === false ? (
        <View style={{ gap: space.x2 }} testID="bot-management-owner-only">
          <SettingsHeading>{copy.management}</SettingsHeading>
          <SettingsFooter>{copy.managementOwnerOnly}</SettingsFooter>
        </View>
      ) : null}
      {management.grants?.editable !== true ? null : (
        <SettingsSection on={SHEET_GROUP} title={copy.management}>
          {MANAGEMENT_CAPABILITIES.map((capability, index) => (
            <View
              key={capability}
              style={
                index === 0
                  ? undefined
                  : {
                      borderTopWidth: edge.hairline,
                      borderTopColor: theme.layer[SHEET_GROUP].divider,
                    }
              }
            >
              <SettingsRow
                on={SHEET_GROUP}
                title={copy[capability]}
                detail={copy[`${capability}Detail`](bot.displayName)}
                icon={capability === 'manage-app' ? 'access' : 'account'}
                control={{
                  kind: 'switch',
                  value: management.grants?.capabilities.includes(capability) === true,
                  onChange: (enabled) => void management.change(capability, enabled),
                  testID: `bot-management-${capability}`,
                }}
              />
            </View>
          ))}
        </SettingsSection>
      )}
      {management.noAppManager ? <Text tone="warning">{copy.noAppManager}</Text> : null}
      {management.error === undefined ? null : (
        <Text accessibilityRole="alert" tone="danger">
          {copy.accessFailed(management.error)}
        </Text>
      )}
    </ScrollView>
  );
}
