import { Redirect, Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  errorText,
  listHostFolders,
  loadWorkspaceOptions,
  resolveWorkspaceFolder,
} from '@botharness/host-client/bot-settings';
import type { HostClient } from '@botharness/host-client/client';
import { createHostSession } from '@botharness/host-client/host-sessions';
import { shownHostName } from '@botharness/host-client/ui/design/host-look';
import { computerEnvironmentKey } from '../../host/conversation-environments';
import { useHostSession, useHostSessions, useHostSnapshot } from '../../host/host-session';
import { useConversationFilter } from '../../host/native-conversation-filter';
import { useHostLook } from '../../host/native-host-look';
import { Composer } from '../../ui/chat/composer';
import {
  FolderPickerSheet,
  type FolderPickerPort,
  type PickedFolder,
} from '../../ui/chat/folder-picker-sheet';
import {
  SessionModelChip,
  SessionModelPicker,
  useSessionModelControl,
} from '../../ui/chat/session-model-composer';
import { SHEET_GROUP, Sheet } from '../../ui/chat/sheet';
import { useDesignTheme } from '../../ui/design/theme';
import { space } from '../../ui/design/tokens';
import { useSessionsTab } from '../../ui/interface-preferences';
import { KeyboardChatFrame } from '../../ui/primitives/keyboard-frame';
import { SettingsGroupItem, SettingsRow } from '../../ui/primitives/settings-row';
import { Text } from '../../ui/primitives/text';
import { canCreateNativeSession } from '../../ui/shell/page-create-actions';
import { useStrings } from '../../ui/strings';
import { lastSessionFolder, rememberSessionFolder } from './last-session-folder';
import { preselectedComputer } from './session-drawer-model';
import { SessionDrawerButton } from './session-drawer-button';
import { enterDrawerRoot } from './session-drawer-state';

export function NewSessionScreen() {
  const enabled = useSessionsTab();
  const t = useStrings().hostSessions;
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const { saved } = useHostSession();
  const connected = useHostSessions();
  const [scope] = useConversationFilter();
  const computers = connected
    .filter((host) => canCreateNativeSession(host.saved))
    .map((host) => ({ ...host, key: computerEnvironmentKey(host.saved.hostId) }));
  const [chosen, setChosen] = useState<string>();
  const hostId =
    computers.find((host) => host.saved.hostId === chosen)?.saved.hostId ??
    preselectedComputer(
      scope,
      computers.map((host) => ({ hostId: host.saved.hostId, key: host.key })),
      saved?.hostId,
    );
  const target = computers.find((host) => host.saved.hostId === hostId);
  useFocusEffect(useCallback(() => enterDrawerRoot(), []));
  if (!enabled) return <Redirect href="/" />;
  return (
    <View style={{ flex: 1, backgroundColor: theme.color.base }} testID="new-session-screen">
      <Stack.Screen options={{ title: t.create, headerShown: false }} />
      {target === undefined ? (
        <>
          <View style={{ paddingTop: insets.top + space.x2, paddingHorizontal: space.x5 }}>
            <SessionDrawerButton />
          </View>
          <View style={{ flex: 1, justifyContent: 'center', padding: space.x5 }}>
            <Text tone="muted" style={{ textAlign: 'center' }}>
              {saved != null && !canCreateNativeSession(saved) ? t.ownerOnly : t.noComputer}
            </Text>
          </View>
        </>
      ) : (
        <NewSessionForm
          key={target.saved.hostId}
          client={target.client}
          hostId={target.saved.hostId}
          hostName={target.saved.hostName}
          computers={computers.map((host) => ({
            hostId: host.saved.hostId,
            name: host.saved.hostName,
          }))}
          onComputer={setChosen}
        />
      )}
    </View>
  );
}

function NewSessionForm({
  client,
  hostId,
  hostName,
  computers,
  onComputer,
}: {
  client: HostClient;
  hostId: string;
  hostName: string;
  computers: readonly { hostId: string; name: string }[];
  onComputer(hostId: string): void;
}) {
  const t = useStrings().hostSessions;
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const look = useHostLook(hostId);
  const online = useHostSnapshot(client).connection.status === 'connected';
  const [folder, setFolder] = useState<PickedFolder | undefined>(() => lastSessionFolder(hostId));
  const [picking, setPicking] = useState<'folder' | 'computer'>();
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const model = useSessionModelControl({
    slug: null,
    sessionId: undefined,
    host: client,
    enabled: online,
    running: false,
  });
  const port: FolderPickerPort = {
    listFolders: (path) => listHostFolders(client, path),
    loadWorkspaceOptions: () => loadWorkspaceOptions(client),
    resolveFolder: (path) => resolveWorkspaceFolder(client, path),
  };

  async function send() {
    const text = draft.trim();
    if (text === '' || folder === undefined || busy || model.visible) return;
    setBusy(true);
    setError(undefined);
    try {
      const choice = model.state?.override;
      const created = await createHostSession(client, {
        ...(folder.workspaceId === undefined
          ? { cwd: folder.path }
          : { workspaceId: folder.workspaceId }),
        text,
        ...(choice?.kind === 'model' ? { choice } : {}),
      });
      rememberSessionFolder(hostId, folder);
      setDraft('');
      router.replace({
        pathname: '/session/[id]',
        params: { id: created.sessionId, hostId, source: 'native', title: text.slice(0, 80) },
      });
    } catch (cause) {
      setError(t.createFailed(errorText(cause)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardChatFrame
      backgroundColor={theme.color.base}
      onComposerLayout={() => {}}
      composer={
        <Composer
          value={draft}
          disabled={!online || busy || folder === undefined}
          files={[]}
          canAttach={false}
          dictation="idle"
          canDictate={false}
          onChange={setDraft}
          onSend={() => void send()}
          onPick={() => {}}
          onRemove={() => {}}
          onDictate={() => {}}
          onStopDictation={() => {}}
          onCancelDictation={() => {}}
          above={
            error === undefined ? null : (
              <View style={{ paddingHorizontal: space.x3, paddingBottom: space.x2 }}>
                <Text accessibilityRole="alert" tone="danger" variant="meta">
                  {error}
                </Text>
              </View>
            )
          }
          sessionControls={{
            blocksSend: model.visible || folder === undefined,
            stopping: busy || !online,
            onStop: undefined,
            render: (width) => (
              <SessionModelChip control={model} width={width} disabled={!online || busy} />
            ),
          }}
        />
      }
    >
      <View style={{ paddingTop: insets.top + space.x2, paddingHorizontal: space.x5 }}>
        <SessionDrawerButton />
      </View>
      <View
        style={{ flex: 1, justifyContent: 'center', paddingHorizontal: space.x5, gap: space.x3 }}
      >
        <View>
          <SettingsGroupItem first last={false} on="canvas">
            <SettingsRow
              on="canvas"
              testID="new-session-computer"
              title={t.computer}
              icon="computer"
              iconTone="muted"
              control={{
                kind: 'value',
                text: shownHostName(look, hostName),
                chevron: computers.length > 1,
              }}
              {...(computers.length > 1 ? { onPress: () => setPicking('computer') } : {})}
            />
          </SettingsGroupItem>
          <SettingsGroupItem first={false} last on="canvas">
            <SettingsRow
              on="canvas"
              testID="new-session-folder"
              title={t.folder}
              icon="folder"
              iconTone="muted"
              control={{ kind: 'value', text: folder?.title ?? t.chooseFolder, chevron: true }}
              onPress={online ? () => setPicking('folder') : undefined}
            />
          </SettingsGroupItem>
        </View>
        {online ? null : (
          <Text tone="muted" variant="meta" style={{ textAlign: 'center' }}>
            {t.computerOffline}
          </Text>
        )}
      </View>
      {picking === 'folder' ? (
        <FolderPickerSheet
          port={port}
          pick={{
            title: t.folderPickerTitle,
            subtitle: t.folderPickerHint,
            confirm: t.useFolder,
            onPick: (next) => {
              setFolder(next);
              setPicking(undefined);
            },
          }}
          onClose={() => setPicking(undefined)}
        />
      ) : null}
      <Sheet
        visible={picking === 'computer'}
        label={t.computer}
        title={t.computer}
        onClose={() => setPicking(undefined)}
      >
        <View>
          {computers.map((computer, index) => (
            <SettingsGroupItem
              key={computer.hostId}
              first={index === 0}
              last={index === computers.length - 1}
              on={SHEET_GROUP}
            >
              <SettingsRow
                on={SHEET_GROUP}
                testID={`new-session-computer-${computer.hostId}`}
                title={computer.name}
                icon="computer"
                iconTone="muted"
                selected={computer.hostId === hostId}
                control={computer.hostId === hostId ? { kind: 'check' } : undefined}
                onPress={() => {
                  setPicking(undefined);
                  onComputer(computer.hostId);
                }}
              />
            </SettingsGroupItem>
          ))}
        </View>
      </Sheet>
      <SessionModelPicker control={model} />
    </KeyboardChatFrame>
  );
}
