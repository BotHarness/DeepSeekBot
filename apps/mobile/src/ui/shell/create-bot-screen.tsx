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
      <Stack.Screen options={{ title: copy.title }} />
      <KeyboardFormScroll
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: space.x5, gap: space.x5 }}
      >
        {state.error ? (
          <Text accessibilityRole="alert" selectable>
            {creationError(state.error)}
          </Text>
        ) : null}
        {!state.loaded || !entryReady ? (
          <Text>{copy.working}</Text>
        ) : draft ? (
          <>
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
            <Button
              label={copy.create}
              testID="create-bot-submit"
              tone="primary"
              busy={state.busy}
              disabled={!draft.displayName.trim() || !target || state.error === 'storage-invalid'}
              onPress={submit}
            />
          </>
        ) : submitted ? (
          <View style={{ gap: space.x5 }}>
            <Text variant="title" strong>
              {name}
            </Text>
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
            {state.error === 'creation-identity-unavailable' ? (
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
                  label={copy.another}
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
