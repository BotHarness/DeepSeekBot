import { Stack } from 'expo-router';
import { useRef, useState, useSyncExternalStore } from 'react';
import { FlatList, Platform, View, type ViewInstance } from 'react-native';

import type { HostClient } from '../../host/client';
import { useHostSnapshot } from '../../host/host-session';
import { space } from '../design/tokens';
import { Button } from '../primitives/button';
import { LoadingIndicator } from '../primitives/loading-indicator';
import { PullToRefresh } from '../primitives/pull-to-refresh';
import { SectionChoice } from './section-choice';
import { KeyboardFormScroll } from '../primitives/keyboard-form';
import { Text } from '../primitives/text';
import { TextField } from '../primitives/text-field';
import { t } from '../strings';
import { useMounted } from '../mounted';
import { createSectionFlow } from './conversation-sections';

export function ConversationSectionSheet({
  client,
  channelId,
  isCurrent,
  onClose,
}: {
  client: HostClient | undefined;
  channelId: string;
  isCurrent(): boolean;
  onClose(): void;
}) {
  const snapshot = useHostSnapshot(client);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [loadFailed, setLoadFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const refreshingRef = useRef(false);
  const mounted = useRef(true);
  const mount = useMounted<ViewInstance>(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [flow] = useState(() =>
    createSectionFlow(
      client ?? {
        call: async () => {
          throw Error('missing Host');
        },
        refresh: async () => {},
      },
      channelId,
      () => mounted.current && isCurrent(),
    ),
  );
  const state = useSyncExternalStore(flow.subscribe, flow.getSnapshot);
  const current = isCurrent();
  const sections =
    current && snapshot.roster ? (snapshot.roster.arrangement?.sections ?? []) : undefined;
  const unavailable =
    !snapshot.roster && ['unreachable', 'refused', 'stopped'].includes(snapshot.connection.status);
  const close = () => {
    if (!state.busy) onClose();
  };
  const run = async (work: () => Promise<void>) => {
    await work();
    if (!mounted.current) return;
    const next = flow.getSnapshot();
    if (next.complete && !next.busy && !next.error && isCurrent()) onClose();
  };
  const error =
    !current || state.error === 'changed'
      ? t.conversationSection.changed
      : state.error === 'create'
        ? t.conversationSection.createFailed
        : state.error === 'assign'
          ? t.conversationSection.assignFailed
          : state.error === 'refresh'
            ? t.conversationSection.refreshFailed
            : loadFailed || unavailable
              ? t.conversationSection.loadFailed
              : undefined;
  const notice = error ? (
    <Text accessibilityRole="alert" tone="danger">
      {error}
    </Text>
  ) : null;
  const reload = async () => {
    if (!isCurrent() || !client || refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    setLoadFailed(false);
    try {
      await client.refresh();
    } catch {
      if (mounted.current) setLoadFailed(true);
    } finally {
      refreshingRef.current = false;
      if (mounted.current) setRefreshing(false);
    }
  };
  const submit = () => void run(() => (state.selected ? flow.retry() : flow.create(name)));
  const returnToList = () => {
    if (state.busy) return;
    setCreating(false);
    void reload();
  };
  return (
    <View ref={mount} style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          headerShown: true,
          headerBackVisible: false,
          title: creating ? t.conversationSection.create : t.rowActions.section,
          gestureEnabled: !state.busy,
        }}
      />
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button
          accessibilityLabel={creating ? t.back : t.close}
          icon={Platform.OS === 'ios' ? (creating ? 'chevron.left' : 'xmark') : undefined}
          disabled={state.busy}
          onPress={creating ? returnToList : close}
        >
          {creating ? t.back : t.close}
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          accessibilityLabel={
            creating
              ? state.selected
                ? t.retry
                : t.conversationSection.submit
              : t.conversationSection.create
          }
          disabled={!current || state.busy || (creating && !state.selected && !name.trim())}
          variant={creating ? 'done' : 'plain'}
          onPress={
            creating
              ? submit
              : () => {
                  flow.reset();
                  setName('');
                  setCreating(true);
                }
          }
        >
          {creating ? (state.selected ? t.retry : t.conversationSection.submit) : t.create}
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      {creating ? (
        <KeyboardFormScroll
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ padding: space.x5, gap: space.x4 }}
        >
          {notice}
          {state.busy ? <LoadingIndicator accessibilityLabel={t.loading} /> : null}
          {state.selected ? (
            <Text>{state.selected.name}</Text>
          ) : (
            <TextField
              testID="section-name"
              accessibilityLabel={t.conversationSection.name}
              placeholder={t.conversationSection.name}
              value={name}
              onChangeText={setName}
              editable={!state.busy && current}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={() => {
                if (!state.busy && current && name.trim()) submit();
              }}
            />
          )}
        </KeyboardFormScroll>
      ) : (
        <PullToRefresh
          refreshing={refreshing}
          onRefresh={() => {
            if (!state.busy) void reload();
          }}
        >
          {(pull) => (
            <FlatList
              {...pull}
              data={sections ?? []}
              keyExtractor={(section) => section.id}
              contentInsetAdjustmentBehavior="automatic"
              contentContainerStyle={{ padding: space.x5, gap: space.x3 }}
              ListHeaderComponent={
                <View style={{ gap: space.x4 }}>
                  {notice}
                  {state.busy ? <LoadingIndicator accessibilityLabel={t.loading} /> : null}
                  {state.selected && state.error ? (
                    <Button
                      label={`${t.retry}: ${state.selected.name}`}
                      busy={state.busy}
                      disabled={!current}
                      onPress={() => void run(flow.retry)}
                    />
                  ) : (loadFailed || unavailable) && current ? (
                    <Button label={t.retry} busy={refreshing} onPress={() => void reload()} />
                  ) : null}
                </View>
              }
              ListEmptyComponent={
                error ? (
                  <View />
                ) : (
                  <View style={{ paddingVertical: space.x6 }}>
                    {sections === undefined ? (
                      <LoadingIndicator accessibilityLabel={t.loading} />
                    ) : (
                      <Text tone="muted">{t.conversationSection.empty}</Text>
                    )}
                  </View>
                )
              }
              renderItem={({ item }) => (
                <SectionChoice
                  title={item.name}
                  testID={`section-${item.id}`}
                  onPress={
                    current && !state.busy ? () => void run(() => flow.choose(item)) : undefined
                  }
                />
              )}
            />
          )}
        </PullToRefresh>
      )}
    </View>
  );
}
