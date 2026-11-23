import { Stack, router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { AppState, Keyboard, View } from 'react-native';
import { channelCreation, useChannelCreation } from '../../host/native-channel-creation';
import { hostSession, useHostAvailability, useHostSession } from '../../host/host-session';
import { hostLooks } from '../../host/native-host-look';
import { conversationFilter } from '../../host/native-conversation-filter';
import { computerEnvironmentKey } from '../../host/conversation-environments';
import { botCreationTargets } from '../../host/bot-creation-targets';
import type { HostStatus } from '../../host/host-glance';
import { channelDraftStarted } from '../../host/creation-drafts';
import { shownHostName } from '@botharness/host-client/ui/design/host-look';
import { useMounted } from '../mounted';
import { KeyboardFormScroll } from '../primitives/keyboard-form';
import { EnvironmentList } from '../primitives/environment-list';
import { TextField } from '../primitives/text-field';
import { labelInField } from '../primitives/field-label';
import { Text } from '../primitives/text';
import { Chip } from '../primitives/chip';
import { SheetSaveButton } from '../primitives/sheet-save-button';
import { SheetStack } from '../primitives/sheet-stack';
import { SettingsHeading, SettingsRow, SettingsSection } from '../primitives/settings-row';
import { SHEET_GROUP } from '../chat/sheet';
import { space } from '../design/tokens';
import { creationError } from './bot-creation-copy';
import { useCreationDraftGuard } from './creation-draft-guard';
import { useStrings } from '../strings';

export function CreateChannelLayout() {
  const t = useStrings();
  const state = useChannelCreation();
  useCreationDraftGuard(state.loaded && !state.busy && channelDraftStarted(state.record), () =>
    channelCreation.reset(),
  );
  return (
    <SheetStack>
      <Stack.Screen name="index" options={{ title: t.chatsCreate.group }} />
      <Stack.Screen name="members" options={{ title: t.channelCreation.members }} />
    </SheetStack>
  );
}

function hostStatusLabel(t: ReturnType<typeof useStrings>, status: HostStatus | undefined) {
  return status === 'online'
    ? t.hostOnline
    : status === 'offline'
      ? t.hostOffline
      : status === 'refused'
        ? t.hostRefused
        : t.hostChecking;
}

export function CreateChannelScreen() {
  const t = useStrings();
  const { entry, hostId } = useLocalSearchParams<{ entry?: string; hostId?: string }>();
  const { hosts } = useHostSession();
  const availability = useHostAvailability();
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
    Keyboard.dismiss();
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
  const hostName = (id: string) => {
    const host = hosts.find((candidate) => candidate.hostId === id);
    return host
      ? shownHostName(hostLooks.look(host.hostId), host.hostName)
      : t.botCreation.targetUnavailable;
  };
  const selected = state.candidates.filter((bot) => record.members.includes(bot.slug));
  const error = state.error
    ? ['unknown-bot', 'archived-bot', 'protected-bot'].includes(state.error)
      ? record.kind === 'draft'
        ? t.channelCreation.membersChanged
        : t.channelCreation.retained
      : state.error === 'invalid-input'
        ? t.channelCreation.invalid
        : creationError(state.error)
    : undefined;
  return (
    <View ref={mount} style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <SheetSaveButton
              label={
                state.result
                  ? t.channelCreation.open
                  : record.kind === 'submitted'
                    ? t.botCreation.retry
                    : t.channelCreation.create
              }
              testID="create-channel-submit"
              busy={state.busy}
              disabled={!state.result && disabled}
              onPress={() => void (state.result ? open() : submit())}
            />
          ),
        }}
      />
      <KeyboardFormScroll
        testID="create-channel-form"
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        pointerEvents={state.busy ? 'none' : 'auto'}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: space.x5, gap: space.x6 }}
      >
        {openError ? (
          <Text accessibilityRole="alert" tone="danger">
            {t.botCreation.targetUnavailable}
          </Text>
        ) : null}
        {error ? (
          <Text accessibilityRole="alert" tone="danger">
            {error}
          </Text>
        ) : null}
        {!state.loaded ? (
          <Text tone="muted">{t.botCreation.working}</Text>
        ) : record.kind === 'draft' ? (
          <>
            {hosts.length === 0 ? (
              <SettingsSection title={t.botCreation.destination} on={SHEET_GROUP}>
                <SettingsRow
                  on={SHEET_GROUP}
                  testID="create-channel-pair"
                  title={t.botCreation.addEnvironment}
                  icon="add"
                  onPress={() => router.push('/pair')}
                />
              </SettingsSection>
            ) : (
              <EnvironmentList
                title={t.botCreation.destination}
                value={record.hostId}
                disabled={state.busy}
                options={botCreationTargets(
                  hosts.map((host) => ({ hostId: host.hostId, name: hostName(host.hostId) })),
                ).map((option) => ({
                  ...option,
                  detail: hostStatusLabel(
                    t,
                    availability.find((choice) => choice.hostId === option.value)?.status,
                  ),
                  disabled: false,
                }))}
                onChange={(id) => void channelCreation.selectHost(id)}
              />
            )}
            <View style={{ gap: space.x2 }}>
              {labelInField ? null : <SettingsHeading>{t.channelCreation.name}</SettingsHeading>}
              <TextField
                testID="create-channel-name"
                accessibilityLabel={t.channelCreation.name}
                placeholder={t.channelCreation.namePlaceholder}
                value={record.name}
                maxLength={120}
                editable={!state.busy}
                returnKeyType="done"
                onChangeText={channelCreation.rename}
              />
            </View>
            <SettingsSection
              title={t.channelCreation.members}
              footer={t.channelCreation.membersFooter}
              on={SHEET_GROUP}
            >
              {!record.hostId ? (
                <SettingsRow on={SHEET_GROUP} title={t.channelCreation.chooseHost} tone="muted" />
              ) : state.loading ? (
                <SettingsRow
                  on={SHEET_GROUP}
                  title={t.channelCreation.chooseBots}
                  control={{ kind: 'busy' }}
                />
              ) : state.error ? (
                <SettingsRow
                  on={SHEET_GROUP}
                  testID="create-channel-retry"
                  title={t.botCreation.retry}
                  onPress={() => void channelCreation.refresh()}
                />
              ) : state.candidates.length === 0 ? (
                <SettingsRow on={SHEET_GROUP} title={t.channelCreation.empty} tone="muted" />
              ) : (
                <SettingsRow
                  on={SHEET_GROUP}
                  testID="create-channel-choose-bots"
                  title={t.channelCreation.chooseBots}
                  control={{
                    kind: 'value',
                    text: t.channelCreation.selected(record.members.length),
                    chevron: true,
                  }}
                  disclosure
                  onPress={() => {
                    Keyboard.dismiss();
                    router.push('/create-channel/members');
                  }}
                />
              )}
              {selected.length > 0 ? (
                <View
                  testID="create-channel-selected"
                  style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    gap: space.x2,
                    padding: space.x4,
                  }}
                >
                  {selected.map((bot) => (
                    <Chip
                      key={bot.slug}
                      testID={`create-channel-chip-${bot.slug}`}
                      label={bot.displayName}
                      selected
                      disabled={state.busy}
                      onPress={() => channelCreation.toggle(bot.slug)}
                    />
                  ))}
                </View>
              ) : null}
            </SettingsSection>
            {state.selectionReset ? (
              <Text accessibilityLiveRegion="polite" tone="muted">
                {t.channelCreation.reset}
              </Text>
            ) : null}
          </>
        ) : (
          <SettingsSection
            title={t.chatsCreate.group}
            footer={t.botCreation.targetFixed}
            on={SHEET_GROUP}
          >
            <SettingsRow on={SHEET_GROUP} title={t.channelCreation.name} detail={record.name} />
            <SettingsRow
              on={SHEET_GROUP}
              title={t.botCreation.destination}
              detail={hostName(record.hostId)}
            />
            <SettingsRow
              on={SHEET_GROUP}
              title={t.channelCreation.members}
              detail={t.channelCreation.selected(record.members.length)}
            />
            <SettingsRow
              on={SHEET_GROUP}
              title={state.result ? t.botCreation.completed : t.botCreation.uncertain}
              {...(state.busy ? { control: { kind: 'busy' as const } } : {})}
              {...(state.result
                ? {
                    testID: 'create-channel-open',
                    detail: t.channelCreation.open,
                    onPress: () => void open(),
                  }
                : {})}
            />
          </SettingsSection>
        )}
      </KeyboardFormScroll>
    </View>
  );
}
