import { useCallback, useRef, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';

import { memoryEntries, type MemoryEntry } from '../../host/bot-profile';
import { useDesignTheme } from '../design/theme';
import { edge, radius, space } from '../design/tokens';
import { useMounted } from '../mounted';
import { Text } from '../primitives/text';
import { ChevronRightIcon, FileIcon, FolderIcon } from '../shell/icons';
import { t } from '../strings';
import { LoadingIndicator } from '../primitives/loading-indicator';

const ICON = 20;

type Loaded<T> =
  | { status: 'loading' }
  | { status: 'ready'; value: T }
  | { status: 'failed'; error: string };

export function useLoad<T, N>(load: () => Promise<T>) {
  const [state, setState] = useState<Loaded<T>>({ status: 'loading' });
  const generation = useRef(0);
  const read = useCallback(() => {
    const current = ++generation.current;
    setState({ status: 'loading' });
    load().then(
      (value) => {
        if (current === generation.current) setState({ status: 'ready', value });
      },
      (error: unknown) => {
        if (current === generation.current)
          setState({
            status: 'failed',
            error: error instanceof Error ? error.message : String(error),
          });
      },
    );
  }, [load]);
  const mount = useMounted<N>(() => {
    read();
    return () => {
      generation.current++;
    };
  }, [read]);
  return { state, read, mount };
}

export function MemoryEntryRow({
  entry,
  first,
  last,
  onOpen,
}: {
  entry: MemoryEntry;
  first: boolean;
  last: boolean;
  onOpen(entry: MemoryEntry): void;
}) {
  const theme = useDesignTheme();
  const detail = entry.kind === 'folder' ? t.memoryItems(entry.count) : undefined;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={detail === undefined ? entry.name : `${entry.name}, ${detail}`}
      onPress={() => onOpen(entry)}
      style={({ pressed }) => ({
        minHeight: theme.touch,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.x4,
        paddingHorizontal: space.x5,
        paddingVertical: space.x4,
        backgroundColor: pressed ? theme.layer.sheet.pressed : theme.layer.sheet.fill,
        borderTopLeftRadius: first ? radius.md : 0,
        borderTopRightRadius: first ? radius.md : 0,
        borderBottomLeftRadius: last ? radius.md : 0,
        borderBottomRightRadius: last ? radius.md : 0,
        borderBottomWidth: last ? 0 : edge.hairline,
        borderBottomColor: theme.color.divider,
      })}
    >
      {entry.kind === 'folder' ? (
        <FolderIcon color={theme.color.muted} size={ICON} />
      ) : (
        <FileIcon color={theme.color.muted} size={ICON} />
      )}
      <Text numberOfLines={1} style={{ flex: 1 }}>
        {entry.name}
      </Text>
      {detail === undefined ? null : (
        <Text variant="meta" tone="muted">
          {detail}
        </Text>
      )}
      <ChevronRightIcon color={theme.color.subtle} size={ICON} />
    </Pressable>
  );
}

export function Status({
  state,
  onRetry,
}: {
  state: Exclude<Loaded<unknown>, { status: 'ready' }>;
  onRetry(): void;
}) {
  const theme = useDesignTheme();
  if (state.status === 'loading')
    return (
      <View style={{ padding: space.x6, alignItems: 'center' }}>
        <LoadingIndicator />
      </View>
    );
  return (
    <View style={{ padding: space.x5, gap: space.x3 }}>
      <Text variant="meta" tone="danger">{`${t.profileFailed} ${state.error}`}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t.tryAgain}
        onPress={onRetry}
        style={{ minHeight: theme.touch, justifyContent: 'center', alignSelf: 'flex-start' }}
      >
        <Text tone="accent" strong>
          {t.tryAgain}
        </Text>
      </Pressable>
    </View>
  );
}

export function MemoryFolderView({
  folder,
  load,
  onOpen,
}: {
  folder: string;
  load: () => Promise<string[]>;
  onOpen(entry: MemoryEntry): void;
}) {
  const theme = useDesignTheme();
  const { state, read, mount } = useLoad<string[], FlatList<MemoryEntry>>(load);
  const entries = state.status === 'ready' ? memoryEntries(state.value, folder) : [];
  return (
    <FlatList
      ref={mount}
      data={entries}
      keyExtractor={(entry) => entry.path}
      style={{ flex: 1, backgroundColor: theme.overlay.fill }}
      contentContainerStyle={{ padding: space.x5 }}
      renderItem={({ item, index }) => (
        <MemoryEntryRow
          entry={item}
          first={index === 0}
          last={index === entries.length - 1}
          onOpen={onOpen}
        />
      )}
      ListEmptyComponent={
        state.status === 'ready' ? (
          <Text tone="muted" style={{ padding: space.x5 }}>
            {t.memoryEmptyFolder}
          </Text>
        ) : (
          <Status state={state} onRetry={read} />
        )
      }
    />
  );
}
