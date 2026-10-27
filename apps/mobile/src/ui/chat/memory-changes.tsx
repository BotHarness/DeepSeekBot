import { useCallback, useRef, useState } from 'react';
import { FlatList, View } from 'react-native';

import type { MemoryChange, MemoryChangesPage, MemoryCommit } from '../../host/memory-changes';
import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';
import { FileDiff } from './approval-diff';
import { Status, useLoad } from './memory-browser';

export interface MemoryChanges {
  commits: MemoryChange[];
  hasMore: boolean;
  loaded: boolean;
  busy: boolean;
  error?: string | undefined;
}

export function useMemoryChanges(
  load: ((offset: number) => Promise<MemoryChangesPage>) | undefined,
) {
  const [state, setState] = useState<MemoryChanges>({
    commits: [],
    hasMore: false,
    loaded: false,
    busy: false,
  });
  const generation = useRef(0);
  const fetch = useCallback(
    (offset: number) => {
      if (load === undefined) return;
      const current = ++generation.current;
      setState((previous) => ({ ...previous, busy: true, error: undefined }));
      load(offset).then(
        (page) => {
          if (current !== generation.current) return;
          setState((previous) => ({
            commits: offset === 0 ? page.commits : [...previous.commits, ...page.commits],
            hasMore: page.hasMore,
            loaded: true,
            busy: false,
          }));
        },
        (error: unknown) => {
          if (current !== generation.current) return;
          setState((previous) => ({
            ...previous,
            busy: false,
            error: error instanceof Error ? error.message : String(error),
          }));
        },
      );
    },
    [load],
  );
  return {
    state,
    reload: () => fetch(0),
    more: () => {
      if (!state.busy) fetch(state.commits.length);
    },
  };
}

export function memoryChangeTime(iso: string): string {
  const at = new Date(iso);
  return Number.isNaN(at.getTime())
    ? ''
    : at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function MemoryCommitView({ load }: { load: () => Promise<MemoryCommit> }) {
  const t = useStrings();
  const theme = useDesignTheme();
  const { state, read, mount } = useLoad<MemoryCommit, FlatList<MemoryCommit['files'][number]>>(
    load,
  );
  const commit = state.status === 'ready' ? state.value : undefined;
  return (
    <FlatList
      ref={mount}
      testID="memory-commit"
      data={commit?.files ?? []}
      keyExtractor={(file) => file.path}
      style={{ flex: 1, backgroundColor: theme.overlay.fill }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ padding: space.x5, gap: space.x6 }}
      refreshing={false}
      onRefresh={read}
      ListHeaderComponent={
        commit === undefined ? undefined : (
          <Text variant="title" strong selectable>
            {commit.subject}
          </Text>
        )
      }
      renderItem={({ item }) => (
        <View testID={`memory-commit-file-${item.path}`} style={{ gap: space.x2 }}>
          <Text variant="meta" strong tone={item.kind === 'deleted' ? 'danger' : 'muted'}>
            {t.memoryFileChange[item.kind]}
          </Text>
          {item.binary || item.lines.length === 0 ? (
            <View style={{ gap: space.x1 }}>
              <Text>{item.path}</Text>
              <Text variant="meta" tone="muted">
                {item.binary ? t.memoryChangeBinary : t.memoryChangeNoText}
              </Text>
            </View>
          ) : (
            <FileDiff change={item} />
          )}
        </View>
      )}
      ListEmptyComponent={
        state.status === 'ready' ? (
          <Text tone="muted">{t.memoryChangeNoFiles}</Text>
        ) : (
          <Status state={state} onRetry={read} />
        )
      }
    />
  );
}
