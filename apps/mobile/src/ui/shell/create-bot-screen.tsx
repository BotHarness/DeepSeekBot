import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { AppState, View, type ViewInstance } from 'react-native';
import { useHostSession } from '../../host/host-session';
import { botCreation, useBotCreation } from '../../host/native-bot-creation';
import type { BotCreationDraft } from '../../host/bot-creation';
import { botCreationTargets } from '../../host/bot-creation-targets';
import { createCreationVisibility } from '../../host/bot-creation-visibility';
import { hostLooks } from '../../host/native-host-look';
import { shownHostName } from '../design/host-look';
import { space } from '../design/tokens';
import { KeyboardFormScroll } from '../primitives/keyboard-form';
import { Button } from '../primitives/button';
import { Text } from '../primitives/text';
import { TextField } from '../primitives/text-field';
import { EnvironmentPicker } from '../primitives/environment-picker';
import { creationCopy as copy, creationError } from './bot-creation-copy';
import { openCreatedBot } from './open-created-bot';
import { useMounted } from '../mounted';
import { t } from '../strings';

export function CreateBotScreen() {
  const { hostId, entry } = useLocalSearchParams<{ hostId?: string; entry?: string }>();
  const { hosts } = useHostSession();
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
      await botCreation.enter(
        entry === 'all'
          ? { kind: 'all' }
          : entry === 'host' && hostId
            ? { kind: 'host', hostId }
            : { kind: 'resume' },
      );
      if (!live) return;
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
  }, [entry, hostId, visibility]);
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
  const targetId =
    state.record.kind === 'submitted' ? state.record.operation.hostId : state.record.draft.hostId;
  const target = hosts.find((host) => host.hostId === targetId);
  const name = state.record.kind === 'submitted' ? state.record.operation.input.displayName : '';
  const edit = (patch: Partial<BotCreationDraft>) => {
    if (draft) void botCreation.edit({ ...draft, ...patch });
  };
  const submit = () => {
    visibility.arm();
    void botCreation.submit();
  };
  return (
    <View ref={mounted} style={{ flex: 1 }}>
      <Stack.Screen options={{ title: source ? copy.importTitle : copy.title }} />
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
            <Button
              label={source ? copy.blank : copy.fromGit}
              testID="create-bot-source"
              disabled={state.busy}
              onPress={() =>
                void (source ? botCreation.blank() : botCreation.beginImport({ gitUrl: '' }))
              }
            />
            <Button
              label={t.marketplace.browse}
              testID="create-bot-marketplace"
              disabled={state.busy}
              onPress={() =>
                router.push({
                  pathname: '/marketplace',
                  params: draft.hostId ? { entry: 'host', hostId: draft.hostId } : { entry: 'all' },
                })
              }
            />
            <Button
              label={draft.source?.kind === 'zip' ? copy.chooseAnotherZip : copy.fromZip}
              testID="import-bot-zip-pick"
              disabled={state.busy}
              onPress={() => void botCreation.beginZip()}
            />
            {draft.source?.kind === 'zip' ? (
              <>
                <Text strong>{copy.zipFile}</Text>
                <Text selectable>{draft.source.fileName}</Text>
                <Text tone="muted">{copy.zipSize(draft.source.sizeBytes)}</Text>
              </>
            ) : null}
            {gitSource ? (
              <>
                <Text strong>{copy.gitUrl}</Text>
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
            <Text strong>{copy.name}</Text>
            <TextField
              testID="create-bot-name"
              accessibilityLabel={copy.name}
              value={draft.displayName}
              onChangeText={(displayName) => edit({ displayName })}
              editable={!state.busy}
              maxLength={120}
            />
            {!draft.source ? (
              <>
                <Text strong>{copy.persona}</Text>
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
                <Text>{copy.bio}</Text>
                <TextField
                  testID="create-bot-bio"
                  accessibilityLabel={copy.bio}
                  value={draft.description}
                  onChangeText={(description) => edit({ description })}
                  multiline
                  editable={!state.busy}
                />
                <Text>{copy.tags}</Text>
                <TextField
                  testID="create-bot-tags"
                  accessibilityLabel={copy.tags}
                  value={draft.tags}
                  onChangeText={(tags) => edit({ tags })}
                  editable={!state.busy}
                />
              </>
            ) : null}
            <Text tone="muted">{copy.model}</Text>
            {state.transfer ? (
              <Text accessibilityLiveRegion="polite">
                {copy.zipProgress(state.transfer.bytes, state.transfer.total)}
              </Text>
            ) : null}
            {draft.source ? (
              <>
                <Text tone="muted">
                  {draft.source.preview ? copy.sourceReady : copy.previewHint}
                </Text>
                <Button
                  label={copy.preview}
                  testID="import-bot-preview"
                  busy={state.busy}
                  disabled={(draft.source.kind === 'git' && !draft.source.gitUrl.trim()) || !target}
                  onPress={() => void botCreation.preview()}
                />
              </>
            ) : null}
            <Button
              label={draft.source ? copy.import : copy.create}
              testID="create-bot-submit"
              tone="primary"
              busy={state.busy}
              disabled={
                !draft.displayName.trim() ||
                !target ||
                state.error === 'storage-invalid' ||
                (!!draft.source && !draft.source.preview)
              }
              onPress={submit}
            />
          </>
        ) : submitted ? (
          <View style={{ gap: space.x5 }}>
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
            <Text accessibilityLiveRegion="polite">
              {state.receipt?.status === 'created'
                ? copy.completed
                : state.receipt
                  ? copy.accepted
                  : copy.uncertain}
            </Text>
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
            ) : (
              <Button
                label={copy.retry}
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
  );
}
