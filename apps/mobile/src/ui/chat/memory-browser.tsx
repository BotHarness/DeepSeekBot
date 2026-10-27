import { ReadFailure } from '../primitives/read-failure';
import { useCallback, useRef, useState } from 'react';
import { FlatList, Pressable, View, useWindowDimensions } from 'react-native';

import {
  memoryEntries,
  type MemoryEntry,
  type PinnedMemory,
  type PinnedRole,
} from '../../host/bot-profile';
import { useDesignTheme } from '../design/theme';
import { edge, memoryGrid, radius, space } from '../design/tokens';
import { useMounted } from '../mounted';
import { Text } from '../primitives/text';
import { SystemSymbol, type SystemSymbolProps } from '../primitives/system-symbol';
import { useStrings } from '../strings';
import { LoadingIndicator } from '../primitives/loading-indicator';

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

type Symbol = SystemSymbolProps['name'];

const SYMBOLS = {
  folder: { ios: 'folder.fill', android: 'folder' },
  text: { ios: 'doc.text', android: 'description' },
  image: { ios: 'photo', android: 'image' },
  data: { ios: 'curlybraces', android: 'data_object' },
  other: { ios: 'doc', android: 'draft' },
  soul: { ios: 'person.text.rectangle', android: 'badge' },
  coreMemory: { ios: 'brain', android: 'psychology' },
} as const satisfies Record<string, Symbol>;

const EXTENSIONS: Record<string, keyof typeof SYMBOLS> = {
  md: 'text',
  markdown: 'text',
  txt: 'text',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
  svg: 'image',
  json: 'data',
  yaml: 'data',
  yml: 'data',
  toml: 'data',
};

export function memorySymbol(entry: MemoryEntry): keyof typeof SYMBOLS {
  if (entry.kind === 'folder') return 'folder';
  const dot = entry.name.lastIndexOf('.');
  return dot <= 0 ? 'other' : (EXTENSIONS[entry.name.slice(dot + 1).toLowerCase()] ?? 'other');
}

export function memoryColumns(width: number, largeText: boolean): number {
  if (largeText) return memoryGrid.largeColumns;
  return width >= memoryGrid.wide ? memoryGrid.wideColumns : memoryGrid.columns;
}

export function useMemoryColumns(): number {
  const theme = useDesignTheme();
  const { width } = useWindowDimensions();
  return memoryColumns(width, theme.largeText);
}

export function memoryGridRows<T>(entries: readonly T[], columns: number): T[][] {
  const rows: T[][] = [];
  for (let index = 0; index < entries.length; index += columns)
    rows.push(entries.slice(index, index + columns));
  return rows;
}

export function memoryEntryLabel(entry: MemoryEntry, items: (count: number) => string): string {
  return entry.kind === 'folder' ? `${entry.name}, ${items(entry.count)}` : entry.name;
}

function MemoryTile({ entry, onOpen }: { entry: MemoryEntry; onOpen(entry: MemoryEntry): void }) {
  const t = useStrings();
  const theme = useDesignTheme();
  const symbol = memorySymbol(entry);
  return (
    <Pressable
      testID={`memory-entry-${entry.path}`}
      accessibilityRole="button"
      accessibilityLabel={memoryEntryLabel(entry, t.memoryItems)}
      onPress={() => onOpen(entry)}
      style={({ pressed }) => ({
        flex: 1,
        alignItems: 'center',
        gap: space.x2,
        paddingVertical: space.x3,
        paddingHorizontal: space.x2,
        borderRadius: radius.md,
        backgroundColor: pressed ? theme.layer.canvas.pressed : 'transparent',
      })}
    >
      <View
        style={{
          width: memoryGrid.tile,
          height: memoryGrid.tile,
          borderRadius: radius.md,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.layer.raised.fill,
        }}
      >
        <SystemSymbol
          name={SYMBOLS[symbol]}
          size={memoryGrid.icon}
          color={symbol === 'folder' ? theme.color.accent : theme.color.muted}
        />
      </View>
      <Text
        variant="meta"
        numberOfLines={theme.largeText ? undefined : 2}
        style={{ textAlign: 'center' }}
      >
        {entry.name}
      </Text>
      {entry.kind === 'folder' ? (
        <Text variant="meta" tone="muted" numberOfLines={1}>
          {t.memoryItems(entry.count)}
        </Text>
      ) : null}
    </Pressable>
  );
}

export function MemoryGridRow({
  entries,
  columns,
  onOpen,
}: {
  entries: readonly MemoryEntry[];
  columns: number;
  onOpen(entry: MemoryEntry): void;
}) {
  return (
    <View style={{ flexDirection: 'row', gap: memoryGrid.gap }}>
      {Array.from({ length: columns }, (_, index) => {
        const entry = entries[index];
        return entry === undefined ? (
          <View key={`gap:${index}`} style={{ flex: 1 }} />
        ) : (
          <MemoryTile key={entry.path} entry={entry} onOpen={onOpen} />
        );
      })}
    </View>
  );
}

export function MemoryPinnedCards({
  pinned,
  onOpen,
}: {
  pinned: readonly PinnedMemory[];
  onOpen(entry: MemoryEntry): void;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  return (
    <View
      testID="memory-pinned"
      style={{ flexDirection: theme.largeText ? 'column' : 'row', gap: space.x4 }}
    >
      {pinned.map((file) => {
        const name = file.path.split('/').at(-1) ?? file.path;
        const caption = file.present ? t.memoryPinned[file.role] : t.memoryPinnedMissing;
        return (
          <Pressable
            key={file.role}
            testID={`memory-pinned-${file.role}`}
            accessibilityRole="button"
            accessibilityLabel={`${name}, ${caption}`}
            accessibilityState={{ disabled: !file.present }}
            disabled={!file.present}
            onPress={() => onOpen({ kind: 'file', name, path: file.path, role: file.role })}
            style={({ pressed }) => ({
              flex: theme.largeText ? undefined : 1,
              minHeight: theme.touch,
              gap: space.x3,
              padding: space.x5,
              borderRadius: radius.md,
              backgroundColor: pressed ? theme.layer.raised.pressed : theme.layer.raised.fill,
            })}
          >
            <SystemSymbol
              name={SYMBOLS[file.role]}
              size={memoryGrid.icon}
              color={file.present ? theme.color.accent : theme.color.subtle}
            />
            <View style={{ gap: space.x1 }}>
              <Text strong tone={file.present ? 'fg' : 'muted'} numberOfLines={1}>
                {name}
              </Text>
              <Text variant="meta" tone="muted">
                {caption}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

export function MemoryAbout({ role }: { role: PinnedRole }) {
  const t = useStrings();
  const theme = useDesignTheme();
  return (
    <View
      testID="memory-about"
      style={{
        borderLeftWidth: edge.focus,
        borderLeftColor: theme.color.border,
        paddingLeft: space.x4,
        paddingVertical: space.x1,
      }}
    >
      <Text tone="muted" style={{ fontStyle: 'italic' }}>
        <Text strong tone="fg" style={{ fontStyle: 'italic' }}>
          {t.memoryAboutTitle}
        </Text>{' '}
        {t.memoryAbout[role]}
      </Text>
    </View>
  );
}

export function Status({
  state,
  onRetry,
}: {
  state: Exclude<Loaded<unknown>, { status: 'ready' }>;
  onRetry(): void;
}) {
  const t = useStrings();
  if (state.status === 'loading')
    return (
      <View style={{ padding: space.x6, alignItems: 'center' }}>
        <LoadingIndicator />
      </View>
    );
  return (
    <View style={{ padding: space.x5, gap: space.x3 }}>
      <ReadFailure title={t.profileFailed} detail={state.error} onRetry={onRetry} />
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
  const t = useStrings();
  const theme = useDesignTheme();
  const columns = useMemoryColumns();
  const { state, read, mount } = useLoad<string[], FlatList<MemoryEntry[]>>(load);
  const entries = state.status === 'ready' ? memoryEntries(state.value, folder) : [];
  return (
    <FlatList
      ref={mount}
      data={memoryGridRows(entries, columns)}
      keyExtractor={(row) => row[0]!.path}
      style={{ flex: 1, backgroundColor: theme.overlay.fill }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ padding: space.x5, gap: space.x2 }}
      renderItem={({ item }) => <MemoryGridRow entries={item} columns={columns} onOpen={onOpen} />}
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
