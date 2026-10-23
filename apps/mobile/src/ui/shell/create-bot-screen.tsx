import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useHostSession } from '../../host/host-session';
import { botCreation, useBotCreation } from '../../host/native-bot-creation';
import type { BotCreationDraft } from '../../host/bot-creation';
import { botCreationTargets } from '../../host/bot-creation-targets';
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

export function CreateBotScreen() {
  const { hostId } = useLocalSearchParams<{ hostId?: string }>();
  const { hosts } = useHostSession();
  const state = useBotCreation();
  const [details, setDetails] = useState(false);
  const focused = useRef(false);
  const focusGeneration = useRef(0);
  const autoOpen = useRef(false);
  const initialized = useRef(false);
  useEffect(() => {
    if (!state.loaded || initialized.current) return;
    initialized.current = true;
    if (state.record.kind === 'draft' && hostId)
      void botCreation.edit({ ...state.record.draft, hostId });
    if (focused.current && state.record.kind === 'submitted') {
      autoOpen.current = state.record.mutationStarted && state.receipt?.status !== 'created';
      void botCreation.resume();
    }
  }, [state, hostId]);
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      focusGeneration.current++;
      const current = botCreation.getSnapshot();
      if (current.record.kind === 'submitted') {
        autoOpen.current = current.record.mutationStarted && current.receipt?.status !== 'created';
        void botCreation.resume();
      }
      return () => {
        focused.current = false;
        focusGeneration.current++;
        autoOpen.current = false;
      };
    }, []),
  );
  const openResult = () => {
    const generation = focusGeneration.current;
    return openCreatedBot(() => focused.current && focusGeneration.current === generation);
  };
  useEffect(() => {
    if (state.receipt?.status !== 'created' || state.busy || !focused.current || !autoOpen.current)
      return;
    autoOpen.current = false;
    void openResult();
  }, [state.receipt, state.busy]);
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
    autoOpen.current = true;
    void botCreation.submit();
  };
  return (
    <>
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
        {!state.loaded ? (
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
            >{`${copy.destination}: ${target ? shownHostName(hostLooks.look(target.hostId), target.hostName) : targetId}`}</Text>
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
            {state.receipt?.status === 'created' ? (
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
    </>
  );
}
