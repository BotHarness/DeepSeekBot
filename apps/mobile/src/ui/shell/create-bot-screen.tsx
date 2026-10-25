import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { AppState, View, type ViewInstance } from 'react-native';
import { useHostSession } from '../../host/host-session';
import { botCreation, useBotCreation } from '../../host/native-bot-creation';
import { enterBotCreation, type CreationEntrySource } from '../../host/bot-creation-entry';
import type { BotCreationDraft } from '../../host/bot-creation';
import { botCreationTargets } from '../../host/bot-creation-targets';
import { createCreationVisibility } from '../../host/bot-creation-visibility';
import { hostLooks } from '../../host/native-host-look';
import { shownHostName } from '../design/host-look';
import { space } from '../design/tokens';
import { useSheetContent } from '../primitives/sheet-content';
import { KeyboardFormScroll } from '../primitives/keyboard-form';
import { Button } from '../primitives/creation-button';
import { Text } from '../primitives/text';
import { LoadingIndicator } from '../primitives/loading-indicator';
import { CreationField as TextField } from '../primitives/creation-field';
import { EnvironmentPicker } from '../primitives/environment-picker';
import { creationCopy as copy, creationError } from './bot-creation-copy';
import { openCreatedBot } from './open-created-bot';
import { useMounted } from '../mounted';
import { useStrings } from '../strings';
import { useDesignTheme } from '../design/theme';

export function CreateBotScreen(props: { initialSource?: CreationEntrySource } = {}) {
  useStrings();
  const { ready, mount } = useSheetContent();
  return (
    <View ref={mount} style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          title:
            props.initialSource === 'zip'
              ? copy.fromZip
              : props.initialSource === 'git'
                ? copy.fromGit
                : copy.title,
        }}
      />
      {ready ? <CreationForm {...props} /> : null}
    </View>
  );
}

function CreationForm({ initialSource = 'blank' }: { initialSource?: CreationEntrySource } = {}) {
  const t = useStrings();
  const { hostId, entry } = useLocalSearchParams<{ hostId?: string; entry?: string }>();
  const { hosts } = useHostSession();
  const theme = useDesignTheme();
  const state = useBotCreation();
  const [details, setDetails] = useState(false);
  const [entryReady, setEntryReady] = useState(false);
  const visibility = useRef(createCreationVisibility(AppState.currentState === 'active')).current;
  const ready = useRef(false);
  const mounted = useMounted<ViewInstance>(() => {
    let live = true;
    const subscription = AppState.addEventListener('change', (state) =>
      visibility.appState(state === 'active'),
    );
    const off = botCreation.subscribe(() => {
      const current = botCreation.getSnapshot();
      if (
        ready.current &&
        current.receipt?.status === 'created' &&
        !current.busy &&
        visibility.takeAutoOpen()
      )
        void openCreatedBot(visibility.lease());
    });
    void botCreation.ready.then(async () => {
      if (!live) return;
      const stillHere = visibility.lease();
      const entered = await enterBotCreation(
        botCreation,
        initialSource,
        entry === 'all'
          ? { kind: 'all' }
          : entry === 'host' && hostId
            ? { kind: 'host', hostId }
            : { kind: 'resume' },
      );
      if (!live) return;
      if (entered === 'cancelled') {
        router.back();
        return;
      }
      ready.current = true;
      setEntryReady(true);
      const current = botCreation.getSnapshot();
      if (visibility.visible() && current.record.kind === 'submitted') {
        if (stillHere() && current.record.mutationStarted && current.receipt?.status !== 'created')
          visibility.arm();
        void botCreation.resume();
      }
    });
    return () => {
      live = false;
      ready.current = false;
      off();
      subscription.remove();
      visibility.blur();
    };
  }, [entry, hostId, visibility, initialSource]);
  useFocusEffect(
    useCallback(() => {
      visibility.focus();
      const current = botCreation.getSnapshot();
      if (ready.current && current.record.kind === 'submitted') {
        if (current.record.mutationStarted && current.receipt?.status !== 'created')
          visibility.arm();
        void botCreation.resume();
      }
      return () => {
        visibility.blur();
      };
    }, [visibility]),
  );
  const openResult = () => openCreatedBot(visibility.lease());
  const submitted = state.record.kind === 'submitted';
  const draft = state.record.kind === 'draft' ? state.record.draft : undefined;
  const gitSource = draft?.source?.kind === 'git' ? draft.source : undefined;
  const source =
    draft?.source ??
    (state.record.kind === 'submitted' ? state.record.operation.source : undefined);
  const flow = entryReady ? (source?.kind ?? (submitted ? 'blank' : initialSource)) : initialSource;
  const importing = flow !== 'blank';
  const targetId =
    state.record.kind === 'submitted' ? state.record.operation.hostId : state.record.draft.hostId;
  const target = hosts.find((host) => host.hostId === targetId);
  const name = state.record.kind === 'submitted' ? state.record.operation.input.displayName : '';
  const edit = (patch: Partial<BotCreationDraft>) => {
    if (draft) void botCreation.edit({ ...draft, ...patch });
  };
  const importingNow = useRef(false);
  const submit = async () => {
    if (importingNow.current || state.busy) return;
    importingNow.current = true;
    visibility.arm();
    const stillHere = visibility.lease();
    try {
      const current = botCreation.getSnapshot();
      if (current.record.kind === 'draft' && current.record.draft.source) {
        await botCreation.preview();
        if (!ready.current || !stillHere() || botCreation.getSnapshot().error) return;
      }
      await botCreation.submit();
    } finally {
      importingNow.current = false;
    }
  };
  const title =
    flow === 'zip'
      ? copy.fromZip
      : flow === 'git'
        ? source?.kind === 'git' && source.origin === 'marketplace'
          ? copy.importTitle
          : copy.fromGit
        : copy.title;
  const submitDisabled =
    !draft ||
    !entryReady ||
    state.busy ||
    (!draft.displayName.trim() && draft.source?.kind !== 'zip') ||
    !target ||
    state.error === 'storage-invalid' ||
    (draft.source?.kind === 'git' && !draft.source.gitUrl.trim()) ||
    (importing && !draft.source);
  return (
    <View ref={mounted} style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          headerShown: true,
          presentation: 'card',
          contentStyle: { backgroundColor: theme.overlay.fill },
          title,
        }}
      />
      <View style={{ flex: 1 }}>
        <KeyboardFormScroll
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ padding: space.x5, gap: space.x5 }}
        >
          {state.error ? (
            <Text accessibilityRole="alert" selectable>
              {state.error === 'git-source-changed' && gitSource?.origin === 'marketplace'
                ? t.marketplace.stale
                : creationError(state.error)}
            </Text>
          ) : null}
          {!state.loaded || !entryReady ? (
            <Text>{copy.working}</Text>
          ) : draft ? (
            <>
              {initialSource === 'zip' || draft.source?.kind === 'zip' ? (
                <Button
                  label={draft.source?.kind === 'zip' ? copy.chooseAnotherZip : copy.fromZip}
                  testID="import-bot-zip-pick"
                  disabled={state.busy}
                  onPress={() => void botCreation.beginZip()}
                />
              ) : null}
              {draft.source?.kind === 'zip' ? (
                <>
                  <Text strong>{copy.zipFile}</Text>
                  <Text selectable>{draft.source.fileName}</Text>
                  <Text tone="muted">{copy.zipSize(draft.source.sizeBytes)}</Text>
                </>
              ) : null}
              {gitSource ? (
                <>
                  {gitSource.origin === 'marketplace' ? (
                    <>
                      <Text selectable>{gitSource.gitUrl}</Text>
                      {gitSource.listingId ? (
                        <Button
                          label={t.marketplace.refreshListing}
                          testID="import-bot-refresh-listing"
                          disabled={state.busy}
                          onPress={() =>
                            router.push({
                              pathname: '/marketplace-bot',
                              params: { id: gitSource.listingId!, entry: 'refresh' },
                            })
                          }
                        />
                      ) : null}
                    </>
                  ) : (
                    <TextField
                      testID="import-bot-git-url"
                      accessibilityLabel={copy.gitUrl}
                      value={gitSource.gitUrl}
                      onChangeText={(gitUrl) => edit({ source: { kind: 'git', gitUrl } })}
                      editable={!state.busy}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  )}
                </>
              ) : null}
              <Text strong>{copy.destination}</Text>
              <EnvironmentPicker
                label={copy.destination}
                placeholder={copy.choose}
                value={draft.hostId}
                options={botCreationTargets(
                  hosts.map((host) => ({
                    hostId: host.hostId,
                    name: shownHostName(hostLooks.look(host.hostId), host.hostName),
                  })),
                )}
                onChange={(hostId) => edit({ hostId })}
              />
              {hosts.length === 0 || !target ? (
                <Button
                  label={copy.pair}
                  testID="create-bot-pair"
                  onPress={() => router.push('/pair')}
                />
              ) : null}
              <TextField
                testID="create-bot-name"
                accessibilityLabel={copy.name}
                value={draft.displayName}
                onChangeText={(displayName) => edit({ displayName })}
                editable={!state.busy}
                maxLength={120}
              />
              {!draft.source && initialSource === 'blank' ? (
                <>
                  <TextField
                    testID="create-bot-persona"
                    accessibilityLabel={copy.persona}
                    placeholder={copy.personaHint}
                    value={draft.persona}
                    onChangeText={(persona) => edit({ persona })}
                    multiline
                    editable={!state.busy}
                  />
                </>
              ) : null}
              <Button
                label={details ? copy.less : copy.more}
                variant="text"
                testID="create-bot-details"
                onPress={() => setDetails(!details)}
              />
              {details ? (
                <>
                  <TextField
                    testID="create-bot-bio"
                    accessibilityLabel={copy.bio}
                    value={draft.description}
                    onChangeText={(description) => edit({ description })}
                    multiline
                    editable={!state.busy}
                  />
                  <TextField
                    testID="create-bot-tags"
                    accessibilityLabel={copy.tags}
                    value={draft.tags}
                    onChangeText={(tags) => edit({ tags })}
                    editable={!state.busy}
                  />
                </>
              ) : null}
              {details ? <Text tone="muted">{copy.model}</Text> : null}
              {state.transfer ? (
                <Text accessibilityLiveRegion="polite">
                  {copy.zipProgress(state.transfer.bytes, state.transfer.total)}
                </Text>
              ) : null}
              {draft ? (
                <Button
                  label={
                    state.busy && importing
                      ? copy.checkingSource
                      : importing
                        ? copy.import
                        : copy.create
                  }
                  testID="create-bot-submit"
                  tone="primary"
                  busy={state.busy}
                  disabled={submitDisabled}
                  onPress={submit}
                />
              ) : null}
            </>
          ) : submitted ? (
            <View style={{ gap: space.x5 }}>
              {state.busy ? (
                <LoadingIndicator accessibilityLabel={importing ? copy.importing : copy.creating} />
              ) : null}
              <Text variant="title" strong>
                {name}
              </Text>
              {source ? (
                <Text selectable>{source.kind === 'zip' ? source.fileName : source.gitUrl}</Text>
              ) : null}
              {state.transfer ? (
                <Text accessibilityLiveRegion="polite">
                  {copy.zipProgress(state.transfer.bytes, state.transfer.total)}
                </Text>
              ) : null}
              {source?.kind === 'zip' &&
              (state.error === 'zip-file-missing' ||
                state.error === 'zip-file-changed' ||
                state.error === 'zip-file-read') ? (
                <Button
                  label={copy.restoreZip}
                  testID="import-bot-zip-restore"
                  disabled={state.busy}
                  onPress={() => void botCreation.restoreZip()}
                />
              ) : null}
              <Text
                selectable
              >{`${copy.destination}: ${target ? shownHostName(hostLooks.look(target.hostId), target.hostName) : copy.targetUnavailable}`}</Text>
              <Text tone="muted">
                {state.record.kind === 'submitted' && state.record.mutationStarted
                  ? copy.targetFixed
                  : copy.beforeSend}
              </Text>
              {state.receipt ||
              (state.record.kind === 'submitted' && state.record.mutationStarted) ? (
                <Text accessibilityLiveRegion="polite">
                  {state.busy
                    ? importing
                      ? copy.importing
                      : copy.creating
                    : state.receipt?.status === 'created'
                      ? copy.completed
                      : state.receipt
                        ? copy.accepted
                        : copy.uncertain}
                </Text>
              ) : null}
              {state.error === 'git-source-changed' ? (
                <>
                  <Text>{copy.previousKept}</Text>
                  <Button
                    label={copy.chooseSourceAgain}
                    testID="import-bot-choose-source-again"
                    onPress={() => void botCreation.newAfterSourceChanged()}
                  />
                </>
              ) : state.error === 'creation-identity-unavailable' ? (
                <>
                  <Text>{copy.previousKept}</Text>
                  <Button
                    label={copy.newAfterUnavailable}
                    testID="create-bot-new-after-unavailable"
                    onPress={() => void botCreation.newAfterUnavailable()}
                  />
                </>
              ) : state.receipt?.status === 'created' ? (
                <>
                  <Button
                    label={copy.open}
                    testID="create-bot-open"
                    tone="primary"
                    onPress={() => void openResult()}
                  />
                  <Button
                    label={source ? copy.importAnother : copy.another}
                    testID="create-bot-another"
                    onPress={() => void botCreation.another(targetId)}
                  />
                </>
              ) : state.busy ? null : (
                <Button
                  label={importing ? copy.import : copy.retry}
                  testID="create-bot-retry"
                  busy={state.busy}
                  onPress={submit}
                />
              )}
              {state.record.kind === 'submitted' &&
              !state.record.mutationStarted &&
              !state.receipt &&
              !state.busy ? (
                <Button
                  label={copy.edit}
                  testID="create-bot-edit"
                  onPress={() => void botCreation.editBeforeSend()}
                />
              ) : null}
            </View>
          ) : null}
        </KeyboardFormScroll>
      </View>
    </View>
  );
}
