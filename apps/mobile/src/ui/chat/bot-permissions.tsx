import { useProfileFocusEffect } from './profile-visibility';
import { useCallback, useMemo } from 'react';
import { View } from 'react-native';

import { botAccess } from '../../host/bot-access';
import { botSettings } from '@botharness/host-client/bot-settings';
import type { HostClient, RosterBot } from '@botharness/host-client/client';
import { useDesignTheme } from '../design/theme';
import { edge } from '../design/tokens';
import { type RowIconName } from '../primitives/row-icon';
import { SettingsRow, SettingsSection } from '../primitives/settings-row';
import { useStrings } from '../strings';
import { useComposerContext } from './composer-context';
import { workspaceLabel } from './composer-labels';
import { contactCounts, externalContacts } from '../../host/messaging-settings';
import { useResource } from '../messaging/use-resource';

export interface BotPermissionsActions {
  onHistory(): void;
  onRules(): void;
  onWorkspace(): void;
  onAccess(): void;
  onExternal(): void;
}

export function BotPermissions({
  client,
  bot,
  actions,
}: {
  client: HostClient;
  bot: RosterBot;
  actions: BotPermissionsActions;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const settings = useMemo(() => botSettings(client, bot.slug), [client, bot.slug]);
  const context = useComposerContext(settings);
  const contacts = useMemo(() => externalContacts(client, bot.slug), [client, bot.slug]);
  useProfileFocusEffect(
    useCallback(() => {
      context.reloadGrants();
      void contacts.load();
    }, [settings, contacts]),
  );
  const contactState = useResource(contacts);
  const counts = contactCounts(contactState.status === 'ready' ? contactState.value : undefined);
  const copy = t.profilePermissions;
  const access = botAccess(bot);
  const workspace = workspaceLabel(context.grants);
  const accessDetail = copy.accessSummary(access.browser, access.computer);
  const rows: {
    testID: string;
    title: string;
    detail?: string;
    icon: RowIconName;
    onPress(): void;
  }[] = [
    {
      testID: 'bot-approval-history',
      title: t.approvals.history,
      icon: 'history',
      onPress: actions.onHistory,
    },
    {
      testID: 'bot-approval-rules',
      title: t.approvals.rules,
      icon: 'rules',
      onPress: actions.onRules,
    },
    {
      testID: 'profile-permissions-workspace',
      title: copy.workspace,
      detail: workspace,
      icon: 'folder',
      onPress: actions.onWorkspace,
    },
    {
      testID: 'profile-permissions-access',
      title: copy.access,
      detail: accessDetail,
      icon: 'access',
      onPress: actions.onAccess,
    },
    {
      testID: 'profile-permissions-external',
      title: t.externalContacts.title,
      ...(contactState.status === 'ready'
        ? { detail: t.externalContacts.rowDetail(counts.pending, counts.approved) }
        : {}),
      icon: 'account',
      onPress: actions.onExternal,
    },
  ];
  return (
    <View ref={context.mount}>
      <SettingsSection on="raised">
        {rows.map((row, index) => (
          <View
            key={row.testID}
            style={
              index === 0
                ? undefined
                : { borderTopWidth: edge.hairline, borderTopColor: theme.layer.raised.divider }
            }
          >
            <SettingsRow
              on="raised"
              testID={row.testID}
              title={row.title}
              {...(row.detail === undefined ? {} : { detail: row.detail })}
              icon={row.icon}
              control={{ kind: 'chevron' }}
              onPress={row.onPress}
            />
          </View>
        ))}
      </SettingsSection>
    </View>
  );
}
