import { shownHostName } from '@botharness/host-client/ui/design/host-look';
import { useRouter } from 'expo-router';
import { useCloudSnapshot } from '../../cloud/native';
import { useCloudConversations } from '../../cloud/native-conversations';
import { cloudViewScope } from '../../cloud/workspace-directory';
import {
  computerEnvironmentKey,
  conversationEnvironments,
} from '../../host/conversation-environments';
import { useHostSession } from '../../host/host-session';
import { useConversationFilter } from '../../host/native-conversation-filter';
import { useHostLook } from '../../host/native-host-look';
import { SHEET_GROUP } from '../chat/sheet';
import { SettingsRow } from '../primitives/settings-row';
import { useStrings } from '../strings';

export function EnvironmentSettingsRow() {
  const t = useStrings();
  const router = useRouter();
  const { hosts } = useHostSession();
  const [filter] = useConversationFilter();
  const cloud = useCloudSnapshot();
  const directory = useCloudConversations();
  const selected = hosts.find((host) => computerEnvironmentKey(host.hostId) === filter);
  const look = useHostLook(selected?.hostId);
  const environments = conversationEnvironments(
    hosts.map((host) => ({
      hostId: host.hostId,
      name: host === selected ? shownHostName(look, host.hostName) : host.hostName,
    })),
    cloud.rows.filter((row) => row.hasSession).map(cloudViewScope),
    directory.workspaces,
    t.allEnvironmentsRow,
  );
  const current =
    environments.find((environment) => environment.key === filter) ?? environments[0]!;
  return (
    <SettingsRow
      on={SHEET_GROUP}
      testID="settings-environment"
      title={t.environmentSheet.title}
      icon="computer"
      control={{ kind: 'value', text: current.title, chevron: true }}
      onPress={() => router.push('/environment')}
    />
  );
}

export function useEnvironmentFooter(): string | undefined {
  const t = useStrings();
  const { saved } = useHostSession();
  const [filter] = useConversationFilter();
  const look = useHostLook(saved?.hostId);
  if (saved == null) return undefined;
  const name = shownHostName(look, saved.hostName);
  return filter === computerEnvironmentKey(saved.hostId)
    ? t.environmentSheet.savedOn(name)
    : t.environmentSheet.savedOnRecent(name);
}
