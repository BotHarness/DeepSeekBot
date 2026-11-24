import type { ConnectionDiagnostic } from '@botharness/host-client/connection-diagnostic';
import type { ConnectHost } from '@botharness/host-client/connect-account';
import { useRouter } from 'expo-router';
import { useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AppState, View, type ViewInstance } from 'react-native';
import { cloudAvailable } from '../../cloud/available';
import { cloudError } from '../../cloud/client';
import { cloudClient, useCloudSnapshot } from '../../cloud/native';
import {
  cloudViewScope,
  createWorkspaceDirectory,
  type CloudWorkspace,
} from '../../cloud/workspace-directory';
import { cloudEnvironmentKey, computerEnvironmentKey } from '../../host/conversation-environments';
import { liveGlance } from '../../host/host-glance';
import {
  useHostSession,
  useHostSessions,
  useHostSnapshot,
  useInbox,
} from '../../host/host-session';
import { connectAccount } from '../../host/native-connect-account';
import { useConversationFilter } from '../../host/native-conversation-filter';
import { watchAccountHosts } from '../../host/watch-account-hosts';
import { SHEET_GROUP } from '../chat/sheet';
import { useDesignTheme } from '../design/theme';
import { space, workspaceStack } from '../design/tokens';
import { useMounted } from '../mounted';
import { ReadFailure } from '../primitives/read-failure';
import { SettingsForm, SettingsFormItem } from '../primitives/settings-form';
import { SettingsRow, SettingsSection } from '../primitives/settings-row';
import { SheetHeader } from '../primitives/sheet-header';
import { SheetScreen } from '../primitives/sheet-screen';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';
import {
  AccountHostRow,
  CloudServiceFormRow,
  HostFormRow,
  StackedHostTiles,
  WorkspaceFormRow,
} from './environment-sheet-rows';
import { hostDrawerRows, unpairedAccountHosts } from './host-drawer-model';
import { bindEnvironmentSheet, closeThen, hostDrawer } from './host-drawer-state';
import { ChatsIcon } from './icons';
import { chooseCloudWorkspace } from './native-workspace-navigation';

const workspaceDirectory = createWorkspaceDirectory(cloudClient);

export function EnvironmentSheetScreen() {
  const t = useStrings();
  const theme = useDesignTheme();
  const router = useRouter();
  const { saved, hosts, client, inbox } = useHostSession();
  const [filter] = useConversationFilter();
  const connection = useHostSnapshot(client, true).connection;
  const list = useInbox(inbox, true);
  const feeds = useHostSessions(true);
  const cloud = useCloudSnapshot();
  const directory = useSyncExternalStore(
    workspaceDirectory.subscribe,
    workspaceDirectory.getSnapshot,
  );
  const [linked, setLinked] = useState<ConnectHost[]>([]);
  const [directoryFailure, setDirectoryFailure] = useState<ConnectionDiagnostic>();
  const [directoryBusy, setDirectoryBusy] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selectionError, setSelectionError] = useState<string>();
  const accountRefresh = useRef(() => {});
  const glances = useMemo(
    () =>
      Object.fromEntries(
        feeds.map((host) => [
          host.saved.hostId,
          {
            ...liveGlance(host.snapshot.connection, host.attention),
            ...(host.attention.status === 'ready'
              ? {
                  unread: Object.values(host.attention.unread ?? {}).filter((count) => count > 0)
                    .length,
                }
              : {}),
          },
        ]),
      ),
    [feeds],
  );
  const rows = useMemo(
    () => hostDrawerRows(hosts, saved?.hostId, glances, liveGlance(connection, list)),
    [hosts, saved?.hostId, glances, connection, list],
  );
  const unpaired = unpairedAccountHosts(linked, hosts);
  const cloudKey = JSON.stringify(cloud.rows.map(cloudViewScope));

  const mount = useMounted<ViewInstance>(() => bindEnvironmentSheet(() => router.back()), [router]);
  const accounts = useMounted<ViewInstance>(() => {
    const watcher = watchAccountHosts({
      account: connectAccount,
      update: setLinked,
      failed: setDirectoryFailure,
      busy: setDirectoryBusy,
      onResume: (refresh) => {
        const subscription = AppState.addEventListener('change', (state) => {
          if (state === 'active') refresh();
        });
        return () => subscription.remove();
      },
    });
    accountRefresh.current = watcher.refresh;
    return () => {
      accountRefresh.current = () => {};
      watcher.close();
    };
  }, []);
  const workspaces = useMounted<ViewInstance>(() => {
    if (!cloudAvailable || !cloud.ready) return;
    void workspaceDirectory.refresh(cloud.rows);
    return () => workspaceDirectory.clear();
  }, [cloud.ready, cloudKey]);

  const choose = async (workspace: CloudWorkspace) => {
    if (selecting || cloud.busy || directory.busy) return;
    const current = hostDrawer.beginWorkspaceSelection();
    setSelecting(true);
    setSelectionError(undefined);
    try {
      await chooseCloudWorkspace(workspace, current);
    } catch (error) {
      if (current()) setSelectionError(cloudError(error));
    } finally {
      setSelecting(false);
    }
  };

  const allSelected = filter === 'all';
  const header = <SheetHeader title={t.environmentSheet.title} onClose={() => router.back()} />;
  return (
    <SheetScreen onMount={mount}>
      <View ref={accounts} collapsable={false} style={{ flex: 1 }}>
        <View ref={workspaces} collapsable={false} style={{ flex: 1 }}>
          <SettingsForm header={header} testID="environment-sheet">
            <SettingsSection
              title={t.environmentSheet.computers}
              on={SHEET_GROUP}
              footer={rows.length === 0 ? t.workspaceAdd.noComputers : undefined}
            >
              <SettingsRow
                on={SHEET_GROUP}
                testID="environment-all"
                title={t.allEnvironmentsRow}
                leading={
                  rows.length > 0 ? (
                    <StackedHostTiles rows={rows} />
                  ) : (
                    <ChatsIcon color={theme.color.accent} size={workspaceStack.tile} />
                  )
                }
                {...(allSelected ? { control: { kind: 'check' as const } } : {})}
                selected={allSelected}
                onPress={() => closeThen(() => hostDrawer.selectAll())}
              />
              {rows.map((row) => (
                <HostFormRow
                  key={row.hostId}
                  row={row}
                  selected={filter === computerEnvironmentKey(row.hostId)}
                />
              ))}
            </SettingsSection>
            {cloudAvailable ? (
              <SettingsSection
                title={t.environmentSheet.cloud}
                on={SHEET_GROUP}
                footer={
                  cloud.ready && !directory.busy && directory.entries.length === 0
                    ? t.workspaceEmpty
                    : undefined
                }
              >
                {directory.entries.flatMap((entry) => [
                  ...entry.workspaces.map((workspace) => (
                    <WorkspaceFormRow
                      key={entry.instanceId + ':' + workspace.organizationId}
                      workspace={workspace}
                      server={entry.server}
                      selected={
                        filter ===
                        cloudEnvironmentKey(
                          cloudViewScope(
                            cloud.rows.find((row) => row.config.instanceId === entry.instanceId),
                          ),
                          workspace.organizationId,
                        )
                      }
                      disabled={selecting || cloud.busy || directory.busy}
                      onPress={() => void choose(workspace)}
                    />
                  )),
                  ...(entry.hasSession
                    ? []
                    : [
                        <CloudServiceFormRow
                          key={entry.instanceId + ':sign-in'}
                          name={
                            cloud.rows.find((row) => row.config.instanceId === entry.instanceId)
                              ?.config.name ?? entry.instanceId
                          }
                          server={entry.server}
                          onPress={() => closeThen(() => router.push('/cloud-services'))}
                        />,
                      ]),
                  ...(entry.hasSession &&
                  !directory.busy &&
                  (entry.error || entry.membersAfter !== null || entry.guestsAfter !== null)
                    ? [
                        <SettingsRow
                          key={entry.instanceId + ':more'}
                          on={SHEET_GROUP}
                          title={entry.error ? t.retry : t.cloudOrganizations.more}
                          {...(entry.error
                            ? { detail: `${new URL(entry.server).host}: ${entry.error}` }
                            : {})}
                          icon="add"
                          onPress={() => void workspaceDirectory.more(entry.instanceId)}
                        />,
                      ]
                    : []),
                ])}
                {directory.busy ? (
                  <SettingsRow
                    on={SHEET_GROUP}
                    title={t.workspaceLoading}
                    control={{ kind: 'busy' }}
                  />
                ) : null}
              </SettingsSection>
            ) : null}
            {selectionError ? (
              <SettingsFormItem>
                <Text accessibilityLiveRegion="polite" style={{ paddingHorizontal: space.x2 }}>
                  {selectionError}
                </Text>
              </SettingsFormItem>
            ) : null}
            {unpaired.length === 0 ? null : (
              <SettingsSection title={t.pairAccount.drawerTitle} on={SHEET_GROUP}>
                {unpaired.map((host) => (
                  <AccountHostRow
                    key={host.id}
                    host={host}
                    form
                    onPress={() =>
                      closeThen(() =>
                        router.push({ pathname: '/pair/account', params: { account: host.id } }),
                      )
                    }
                  />
                ))}
              </SettingsSection>
            )}
            {directoryFailure ? (
              <SettingsFormItem>
                <ReadFailure
                  title={t.pairAccount.directoryFailed}
                  detail={JSON.stringify(directoryFailure, null, 2)}
                  busy={directoryBusy}
                  onRetry={() => accountRefresh.current()}
                />
              </SettingsFormItem>
            ) : null}
            <SettingsSection on={SHEET_GROUP}>
              <SettingsRow
                on={SHEET_GROUP}
                testID="environment-pair"
                title={t.pairAnother}
                tone="accent"
                icon="add"
                iconTone="accent"
                onPress={() => closeThen(() => hostDrawer.pairNew())}
              />
              {cloudAvailable ? (
                <SettingsRow
                  on={SHEET_GROUP}
                  testID="environment-join"
                  title={t.workspaceAdd.join}
                  tone="accent"
                  icon="qr"
                  iconTone="accent"
                  onPress={() => closeThen(() => router.push('/cloud-join'))}
                />
              ) : null}
              {cloudAvailable ? (
                <SettingsRow
                  on={SHEET_GROUP}
                  testID="environment-cloud-services"
                  title={t.workspaceAdd.manage}
                  icon="open"
                  disclosure
                  onPress={() => closeThen(() => router.push('/cloud-services'))}
                />
              ) : null}
            </SettingsSection>
          </SettingsForm>
        </View>
      </View>
    </SheetScreen>
  );
}
