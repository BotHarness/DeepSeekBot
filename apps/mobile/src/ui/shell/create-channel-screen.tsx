import { Stack, router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { AppState, Keyboard, View } from 'react-native';
import { channelCreation, useChannelCreation } from '../../host/native-channel-creation';
import { hostSession, useHostSession } from '../../host/host-session';
import { hostLooks } from '../../host/native-host-look';
import { conversationFilter } from '../../host/native-conversation-filter';
import { computerEnvironmentKey } from '../../host/conversation-environments';
import { botCreationTargets } from '../../host/bot-creation-targets';
import { shownHostName } from '../design/host-look';
import { useMounted } from '../mounted';
import { KeyboardFormScroll } from '../primitives/keyboard-form';
import { EnvironmentPicker } from '../primitives/environment-picker';
import { CreationField as TextField } from '../primitives/creation-field';
import { Text } from '../primitives/text';
import { Button } from '../primitives/creation-button';
import { useDesignTheme } from '../design/theme';
import { SettingsGroupItem, SettingsRow } from '../primitives/settings-row';
import { BotPickerSheet } from '../chat/bot-picker-sheet';
import { CreationConfirm } from '../primitives/creation-confirm';
import { radius, space } from '../design/tokens';
import { BotPortrait } from '../bot-avatar';
import { creationError } from './bot-creation-copy';
import { useStrings } from '../strings';

export function CreateChannelScreen() {
  const t = useStrings();
  const theme = useDesignTheme();
  const { entry, hostId } = useLocalSearchParams<{ entry?: string; hostId?: string }>();
  const { hosts } = useHostSession();
  const state = useChannelCreation();
  const record = state.record;
  const focus = useRef(false);
  const opening = useRef(false);
  const [openError, setOpenError] = useState(false);
  const [picker, setPicker] = useState<{ hostId: string; selected: Set<string> }>();
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
        : t.newChannel,
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
          headerShown: true,
          presentation: 'card',
          contentStyle: { backgroundColor: theme.overlay.fill },
          headerRight: () => (
            <CreationConfirm
              label={state.result ? t.channelCreation.open : action.label}
              disabled={!state.result && disabled}
              busy={state.busy}
              testID="create-channel-submit"
              onPress={state.result ? () => void open() : action.onPress}
            />
          ),
        }}
      />
      <View style={{ flex: 1 }}>
        <KeyboardFormScroll contentContainerStyle={{ padding: space.x5, gap: space.x5 }}>
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
                  setPicker(undefined);
                  void channelCreation.selectHost(id);
                }}
              />
              {hosts.length === 0 ? (
                <Button label={t.botCreation.pair} onPress={() => router.push('/pair')} />
              ) : null}
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
              ) : (
                <SettingsGroupItem first last on="raised">
                  <SettingsRow
                    title={t.channelCreation.chooseBots}
                    detail={t.channelCreation.selected(record.members.length)}
                    testID="create-channel-choose-bots"
                    on="raised"
                    disclosure
                    onPress={
                      state.busy
                        ? undefined
                        : () => {
                            Keyboard.dismiss();
                            setPicker({
                              hostId: record.hostId,
                              selected: new Set(record.members),
                            });
                          }
                    }
                  />
                </SettingsGroupItem>
              )}
            </>
          ) : (
            <>
              <Text strong>{record.name}</Text>
              <Text>{`${t.botCreation.destination}: ${hosts.find((host) => host.hostId === record.hostId)?.hostName ?? t.botCreation.targetUnavailable}`}</Text>
              <Text>{state.result ? t.botCreation.completed : t.botCreation.uncertain}</Text>
              <Text tone="muted">{t.botCreation.targetFixed}</Text>
            </>
          )}
        </KeyboardFormScroll>
        {picker && picker.hostId === record.hostId && record.kind === 'draft' && !state.busy ? (
          <BotPickerSheet
            key={picker.hostId}
            title={t.channelCreation.chooseBots}
            candidates={state.candidates}
            renderLeading={(bot) => <BotPortrait bot={bot} size={theme.touch} corner={radius.sm} />}
            selected={picker.selected}
            busy={state.loading}
            canConfirm={!state.loading && !state.error}
            onClose={() => setPicker(undefined)}
            onToggle={(slug) =>
              setPicker((current) => {
                if (!current) return current;
                const selected = new Set(current.selected);
                if (selected.has(slug)) selected.delete(slug);
                else selected.add(slug);
                return { ...current, selected };
              })
            }
            onConfirm={() => {
              for (const bot of state.candidates) {
                if (record.members.includes(bot.slug) !== picker.selected.has(bot.slug))
                  channelCreation.toggle(bot.slug);
              }
              setPicker(undefined);
            }}
          />
        ) : null}
      </View>
    </View>
  );
}
