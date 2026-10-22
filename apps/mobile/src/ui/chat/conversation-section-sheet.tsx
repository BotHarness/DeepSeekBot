import { useRef, useState, useSyncExternalStore } from 'react';
import { FlatList, View, type ViewInstance } from 'react-native';

import type { HostClient } from '../../host/client';
import { useHostSnapshot } from '../../host/host-session';
import { space } from '../design/tokens';
import { Button } from '../primitives/button';
import { DrawerHeader } from '../primitives/drawer-header';
import { KeyboardFormScroll } from '../primitives/keyboard-form';
import { SettingsRow } from '../primitives/settings-row';
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
  const sections = current ? snapshot.roster?.arrangement?.sections : undefined;
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
            : loadFailed
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
  return (
    <View ref={mount} style={{ flex: 1 }}>
      <View style={{ padding: space.x5 }}>
        <DrawerHeader
          title={creating ? t.conversationSection.create : t.rowActions.section}
          onClose={close}
        />
      </View>
      {creating ? (
        <KeyboardFormScroll contentContainerStyle={{ padding: space.x5, gap: space.x4 }}>
          {notice}
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
                if (!state.busy && current && name.trim()) void run(() => flow.create(name));
              }}
            />
          )}
          <Button
            testID="section-create"
            label={state.selected ? t.retry : t.conversationSection.submit}
            tone="primary"
            busy={state.busy}
            disabled={!current || (!state.selected && !name.trim())}
            onPress={() => void run(() => (state.selected ? flow.retry() : flow.create(name)))}
          />
          <Button
            label={t.back}
            disabled={state.busy}
            onPress={() => {
              setCreating(false);
              void reload();
            }}
          />
        </KeyboardFormScroll>
      ) : (
        <FlatList
          data={sections ?? []}
          keyExtractor={(section) => section.id}
          contentContainerStyle={{ padding: space.x5, gap: space.x3 }}
          ListHeaderComponent={
            <>
              {notice}
              <Button
                testID="section-new"
                label={t.conversationSection.create}
                disabled={!current || state.busy}
                onPress={() => {
                  flow.reset();
                  setName('');
                  setCreating(true);
                }}
              />
              {state.selected && state.error ? (
                <Button
                  label={`${t.retry}: ${state.selected.name}`}
                  busy={state.busy}
                  disabled={!current}
                  onPress={() => void run(flow.retry)}
                />
              ) : null}
            </>
          }
          ListEmptyComponent={<Text>{sections ? t.conversationSection.empty : t.loading}</Text>}
          ListFooterComponent={
            <Button
              label={t.conversationSection.refresh}
              busy={refreshing}
              disabled={!current || state.busy}
              onPress={() => void reload()}
            />
          }
          renderItem={({ item }) => (
            <SettingsRow
              title={item.name}
              testID={`section-${item.id}`}
              selected={state.selected?.id === item.id}
              onPress={current && !state.busy ? () => void run(() => flow.choose(item)) : undefined}
            />
          )}
        />
      )}
    </View>
  );
}
