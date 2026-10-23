import { Stack, router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { AppState, FlatList, Platform, View } from 'react-native';
import { channelCreation, useChannelCreation } from '../../host/native-channel-creation';
import { hostSession, useHostSession } from '../../host/host-session';
import { hostLooks } from '../../host/native-host-look';
import { conversationFilter } from '../../host/native-conversation-filter';
import { computerEnvironmentKey } from '../../host/conversation-environments';
import { botCreationTargets } from '../../host/bot-creation-targets';
import { shownHostName } from '../design/host-look';
import { useMounted } from '../mounted';
import { CreationForm } from '../primitives/creation-form';
import { renderKeyboardFormScroll } from '../primitives/keyboard-form';
import { EnvironmentPicker } from '../primitives/environment-picker';
import { TextField } from '../primitives/text-field';
import { Text } from '../primitives/text';
import { Button } from '../primitives/button';
import { ParticipantChoice } from '../primitives/participant-choice';
import { space } from '../design/tokens';
import { creationError } from './bot-creation-copy';
import { t } from '../strings';

export function CreateChannelScreen() {
  const { entry, hostId } = useLocalSearchParams<{ entry?: string; hostId?: string }>();
  const { hosts } = useHostSession();
  const state = useChannelCreation();
  const record = state.record;
  const focus = useRef(false);
  const opening = useRef(false);
  const [openError, setOpenError] = useState(false);
  useFocusEffect(
    useCallback(() => {
      focus.current = true;
      return () => {
        focus.current = false;
      };
    }, []),
  );
  const mount = useMounted(() => {
    let active = true;
    void channelCreation.ready.then(async () => {
      if (!active) return;
      const current = channelCreation.getSnapshot();
      if (current.record.kind === 'draft')
        await channelCreation.selectHost(entry === 'host' && hostId ? hostId : '');
    });
    return () => {
      active = false;
    };
  }, [entry, hostId]);
  const open = async () => {
    if (opening.current) return;
    opening.current = true;
    try {
      const current = channelCreation.getSnapshot();
      const target = hostSession
        .getState()
        .hosts.find((host) => host.hostId === current.record.hostId);
      if (
        !current.result ||
        !target ||
        (current.record.kind === 'submitted' && target.deviceId !== current.record.deviceId)
      ) {
        setOpenError(true);
        return;
      }
      await conversationFilter.ready;
      if (!focus.current || AppState.currentState !== 'active') return;
      if (!(await hostSession.switchTo(target.hostId))) {
        setOpenError(true);
        return;
      }
      if (!focus.current || AppState.currentState !== 'active') return;
      conversationFilter.set(computerEnvironmentKey(target.hostId));
      router.replace({
        pathname: '/channel/[id]',
        params: { id: current.result, hostId: target.hostId },
      });
      await channelCreation.reset();
    } catch {
      setOpenError(true);
    } finally {
      opening.current = false;
    }
  };
  const submit = async () => {
    await channelCreation.submit();
    if (focus.current && AppState.currentState === 'active') await open();
  };
  const disabled =
    !state.loaded ||
    state.busy ||
    state.loading ||
    (record.kind === 'draft' && !!state.error) ||
    !record.name.trim() ||
    !hosts.some((host) => host.hostId === record.hostId);
  const action = {
    label: state.busy
      ? t.botCreation.working
      : record.kind === 'submitted'
        ? t.botCreation.retry
        : t.botCreation.create,
    disabled,
    testID: 'create-channel-submit',
    onPress: () => {
      void submit();
    },
  };
  return (
    <View ref={mount} style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          title: t.newChannel,
          ...(Platform.OS === 'android'
            ? {
                headerShown: false,
                presentation: 'transparentModal',
                animation: 'none',
                contentStyle: { backgroundColor: 'transparent' },
              }
            : {}),
        }}
      />
      <CreationForm
        dismissLabel={record.kind === 'submitted' ? t.close : t.cancel}
        title={t.newChannel}
        onDismiss={() => router.back()}
        action={state.result ? undefined : action}
      >
        <FlatList
          data={record.kind === 'draft' && !state.loading && !state.error ? state.candidates : []}
          keyExtractor={(bot) => bot.slug}
          renderScrollComponent={renderKeyboardFormScroll}
          contentContainerStyle={{ padding: space.x4, gap: space.x4 }}
          renderItem={({ item: bot }) => (
            <ParticipantChoice
              id={bot.slug}
              label={bot.displayName}
              checked={record.members.includes(bot.slug)}
              disabled={state.busy}
              onChange={() => channelCreation.toggle(bot.slug)}
            />
          )}
          ListHeaderComponent={
            <>
              {openError ? (
                <Text accessibilityRole="alert">{t.botCreation.targetUnavailable}</Text>
              ) : null}
              {state.error ? (
                <Text accessibilityRole="alert">
                  {['unknown-bot', 'archived-bot', 'protected-bot'].includes(state.error)
                    ? record.kind === 'draft'
                      ? t.channelCreation.membersChanged
                      : t.channelCreation.retained
                    : state.error === 'invalid-input'
                      ? t.channelCreation.invalid
                      : creationError(state.error)}
                </Text>
              ) : null}
              {!state.loaded ? (
                <Text>{t.botCreation.working}</Text>
              ) : record.kind === 'draft' ? (
                <>
                  <Text strong>{t.botCreation.destination}</Text>
                  <EnvironmentPicker
                    label={t.botCreation.destination}
                    placeholder={t.botCreation.choose}
                    value={record.hostId}
                    options={botCreationTargets(
                      hosts.map((host) => ({
                        hostId: host.hostId,
                        name: shownHostName(hostLooks.look(host.hostId), host.hostName),
                      })),
                    )}
                    onChange={(id) => {
                      void channelCreation.selectHost(id);
                    }}
                  />
                  {hosts.length === 0 ? (
                    <Button label={t.botCreation.pair} onPress={() => router.push('/pair')} />
                  ) : null}
                  <Text strong>{t.groupName}</Text>
                  <TextField
                    testID="create-channel-name"
                    accessibilityLabel={t.groupName}
                    value={record.name}
                    maxLength={120}
                    editable={!state.busy}
                    onChangeText={channelCreation.rename}
                  />
                  <Text strong>{t.groupMembersSection}</Text>
                  {state.selectionReset ? (
                    <Text accessibilityLiveRegion="polite">{t.channelCreation.reset}</Text>
                  ) : null}
                  {!record.hostId ? (
                    <Text>{t.channelCreation.chooseHost}</Text>
                  ) : state.loading ? (
                    <Text>{t.botCreation.working}</Text>
                  ) : state.error ? (
                    <Button
                      label={t.botCreation.retry}
                      onPress={() => {
                        void channelCreation.refresh();
                      }}
                    />
                  ) : state.candidates.length === 0 ? (
                    <Text>{t.channelCreation.empty}</Text>
                  ) : null}
                </>
              ) : (
                <>
                  <Text strong>{record.name}</Text>
                  <Text>{`${t.botCreation.destination}: ${hosts.find((host) => host.hostId === record.hostId)?.hostName ?? t.botCreation.targetUnavailable}`}</Text>
                  <Text>{state.result ? t.botCreation.completed : t.botCreation.uncertain}</Text>
                  <Text tone="muted">{t.botCreation.targetFixed}</Text>
                </>
              )}
            </>
          }
          ListFooterComponent={
            state.result ? (
              <Button
                label={t.channelCreation.open}
                testID="create-channel-open"
                onPress={() => {
                  void open();
                }}
              />
            ) : Platform.OS !== 'android' ? (
              <Button
                label={action.label}
                testID="create-channel-submit"
                disabled={disabled}
                onPress={action.onPress}
              />
            ) : undefined
          }
        />
      </CreationForm>
    </View>
  );
}
