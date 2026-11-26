import { Redirect, Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { View, type ViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  errorText,
  listHostFolders,
  loadWorkspaceOptions,
  resolveWorkspaceFolder,
} from '@botharness/host-client/bot-settings';
import { MethodRefused, type HostClient } from '@botharness/host-client/client';
import { createHostSession } from '@botharness/host-client/host-sessions';
import { useMounted } from '../../ui/mounted';
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
  SessionModelLogo,
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
import { promptPlaceholder } from '../../ui/chat/session-header-title';
import { useStrings } from '../../ui/strings';
import { useCreateFolder } from '../../host/member-permissions';
import { lastSessionFolder, rememberSessionFolder } from './last-session-folder';
import { preselectedComputer } from './session-drawer-model';
import { HeaderBackButton } from '../../ui/chat/header-chrome';
import { useSessionsStackFit } from './drawer-root';
import { SessionDrawerButton } from './session-drawer-button';
import { enterDrawerRoot } from './session-drawer-state';

function NewSessionLeading({ stacked }: { stacked: boolean }) {
  const router = useRouter();
  if (!stacked) return <SessionDrawerButton />;
  return (
    <HeaderBackButton
      testID="new-session-back"
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/sessions'))}
    />
  );
}

export function NewSessionScreen({ stacked = false }: { stacked?: boolean }) {
  const enabled = useSessionsTab();
  const t = useStrings().hostSessions;
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const { saved } = useHostSession();
  const connected = useHostSessions();
  const [scope] = useConversationFilter();
  const computers = connected
    .filter(
      (host) =>
        canCreateNativeSession(host.saved) &&
        (host.snapshot.connection.status === 'connected' || host.saved.hostId === saved?.hostId),
    )
    .map((host) => ({ ...host, key: computerEnvironmentKey(host.saved.hostId) }));
  const [chosen, setChosen] = useState<string>();
  const [draft, setDraft] = useState('');
  const hostId =
    computers.find((host) => host.saved.hostId === chosen)?.saved.hostId ??
    preselectedComputer(
      scope,
      computers.map((host) => ({ hostId: host.saved.hostId, key: host.key })),
      saved?.hostId,
    );
  const target = computers.find((host) => host.saved.hostId === hostId);
  useFocusEffect(useCallback(() => (stacked ? undefined : enterDrawerRoot()), [stacked]));
  useSessionsStackFit();
  if (!enabled) return <Redirect href="/" />;
  return (
    <View style={{ flex: 1, backgroundColor: theme.color.base }} testID="new-session-screen">
      <Stack.Screen options={{ title: t.create, headerShown: false }} />
      {target === undefined ? (
        <>
          <View style={{ paddingTop: insets.top + space.x2, paddingHorizontal: space.x5 }}>
            <NewSessionLeading stacked={stacked} />
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
          stacked={stacked}
          draft={draft}
          onDraft={setDraft}
        />
      )}
    </View>
  );
}

function createdSessionOf(cause: unknown): string | undefined {
  if (!(cause instanceof MethodRefused)) return undefined;
  const details = cause.details;
  return typeof details === 'object' &&
    details !== null &&
    'sessionId' in details &&
    typeof details.sessionId === 'string'
    ? details.sessionId
    : undefined;
}

function valueRow(largeText: boolean, text: string, chevron: boolean) {
  if (!largeText) return { control: { kind: 'value' as const, text, chevron } };
  return { detail: text, ...(chevron ? { control: { kind: 'chevron' as const } } : {}) };
}

function NewSessionForm({
  client,
  hostId,
  hostName,
  computers,
  onComputer,
  stacked,
  draft,
  onDraft: setDraft,
}: {
  stacked: boolean;
  client: HostClient;
  hostId: string;
  hostName: string;
  computers: readonly { hostId: string; name: string }[];
  onComputer(hostId: string): void;
  draft: string;
  onDraft(text: string): void;
}) {
  const t = useStrings().hostSessions;
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const look = useHostLook(hostId);
  const online = useHostSnapshot(client).connection.status === 'connected';
  const [folder, setFolder] = useState<PickedFolder | undefined>(() => lastSessionFolder(hostId));
  const [picking, setPicking] = useState<'folder' | 'computer'>();
  const [busy, setBusy] = useState(false);
  const [blank, setBlank] = useState<string>();
  const active = useRef(true);
  const mount = useMounted<ViewInstance>(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const [error, setError] = useState<string>();
  const model = useSessionModelControl({
    slug: null,
    sessionId: undefined,
    host: client,
    hostId,
    enabled: online,
    running: false,
  });
  const createFolder = useCreateFolder(client);
  const port = useMemo<FolderPickerPort>(
    () => ({
      listFolders: (path) => listHostFolders(client, path),
      loadWorkspaceOptions: () => loadWorkspaceOptions(client),
      resolveFolder: (path) => resolveWorkspaceFolder(client, path),
      createFolder,
    }),
    [client, createFolder],
  );

  async function send() {
    const text = draft.trim();
    if (text === '' || folder === undefined || busy || model.visible) return;
    setBusy(true);
    setError(undefined);
    try {
      const choice = model.state?.override;
      const created = await createHostSession(client, {
        cwd: folder.path,
        text,
        ...(choice?.kind === 'model' ? { choice } : {}),
        ...(blank === undefined ? {} : { sessionId: blank }),
      });
      if (!active.current) return;
      rememberSessionFolder(hostId, folder);
      setDraft('');
      router.replace({
        pathname: '/session/[id]',
        params: {
          id: created.sessionId,
          hostId,
          source: 'native',
          title: promptPlaceholder(text),
          fresh: '1',
        },
      });
    } catch (cause) {
      if (!active.current) return;
      const left = createdSessionOf(cause);
      if (left !== undefined) setBlank(left);
      setError(t.createFailed(errorText(cause)));
    } finally {
      if (active.current) setBusy(false);
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
            model: <SessionModelLogo control={model} disabled={!online || busy} />,
          }}
        />
      }
    >
      <View ref={mount} />
      <View style={{ paddingTop: insets.top + space.x2, paddingHorizontal: space.x5 }}>
        <NewSessionLeading stacked={stacked} />
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
              {...valueRow(theme.largeText, shownHostName(look, hostName), computers.length > 1)}
              {...(computers.length > 1 && !busy ? { onPress: () => setPicking('computer') } : {})}
            />
          </SettingsGroupItem>
          <SettingsGroupItem first={false} last on="canvas">
            <SettingsRow
              on="canvas"
              testID="new-session-folder"
              title={t.folder}
              icon="folder"
              iconTone="muted"
              {...valueRow(theme.largeText, folder?.title ?? t.chooseFolder, true)}
              onPress={online && !busy ? () => setPicking('folder') : undefined}
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
            heading: t.folderBrowse,
            target: t.folderTarget,
            confirm: t.useFolder,
            onPick: (next) => {
              setFolder(next);
              setBlank(undefined);
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
