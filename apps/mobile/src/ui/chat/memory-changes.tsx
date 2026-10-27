import { useCallback, useRef, useState } from 'react';
import { Pressable, SectionList, View } from 'react-native';

import type {
  MemoryChange,
  MemoryChangesPage,
  MemoryCommit,
  MemoryCommitFile,
  MemoryDiffRow,
} from '../../host/memory-changes';
import { useDesignTheme } from '../design/theme';
import { memoryDiff, radius, space } from '../design/tokens';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';
import { ChevronRightIcon } from '../shell/icons';
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

function DiffText({ row }: { row: Extract<MemoryDiffRow, { kind: 'line' }> }) {
  const theme = useDesignTheme();
  const mark =
    row.change === 'add'
      ? `${theme.color.success}${memoryDiff.markFill}`
      : `${theme.color.danger}${memoryDiff.markFill}`;
  const parts: { text: string; marked: boolean }[] = [];
  let offset = 0;
  for (const [start, end] of row.marks) {
    if (start > offset) parts.push({ text: row.text.slice(offset, start), marked: false });
    parts.push({ text: row.text.slice(start, end), marked: true });
    offset = end;
  }
  if (offset < row.text.length) parts.push({ text: row.text.slice(offset), marked: false });
  return (
    <Text
      variant="meta"
      selectable
      style={{ flex: 1, fontFamily: theme.mono, paddingVertical: space.x1 }}
    >
      {parts.length === 0
        ? ' '
        : parts.map((part, index) =>
            part.marked ? (
              <Text
                key={index}
                variant="meta"
                style={{ fontFamily: theme.mono, backgroundColor: mark }}
              >
                {part.text}
              </Text>
            ) : (
              part.text
            ),
          )}
    </Text>
  );
}

function DiffRow({ row }: { row: MemoryDiffRow }) {
  const theme = useDesignTheme();
  if (row.kind === 'hunk')
    return (
      <View
        style={{
          backgroundColor: theme.color.accentTint,
          paddingHorizontal: space.x4,
          paddingVertical: space.x1,
        }}
      >
        <Text
          variant="meta"
          numberOfLines={1}
          style={{ fontFamily: theme.mono, color: theme.color.accentText }}
        >
          {row.header}
        </Text>
      </View>
    );
  const tint =
    row.change === 'add'
      ? `${theme.color.success}${memoryDiff.addFill}`
      : row.change === 'remove'
        ? `${theme.color.danger}${memoryDiff.removeFill}`
        : 'transparent';
  const bar =
    row.change === 'add'
      ? theme.color.success
      : row.change === 'remove'
        ? theme.color.danger
        : 'transparent';
  return (
    <View
      testID={`memory-diff-${row.change}`}
      style={{ flexDirection: 'row', alignItems: 'stretch', backgroundColor: tint }}
    >
      <View style={{ width: memoryDiff.bar, backgroundColor: bar }} />
      <Text
        variant="meta"
        tone="subtle"
        accessibilityElementsHidden
        importantForAccessibility="no"
        style={{
          width: memoryDiff.gutter,
          paddingRight: space.x2,
          paddingVertical: space.x1,
          textAlign: 'right',
          fontFamily: theme.mono,
        }}
      >
        {row.newLine ?? row.oldLine}
      </Text>
      <View style={{ flex: 1, paddingRight: space.x4 }}>
        <DiffText row={row} />
      </View>
    </View>
  );
}

function FileHeader({
  file,
  open,
  onToggle,
}: {
  file: MemoryCommitFile;
  open: boolean;
  onToggle(): void;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const slash = file.path.lastIndexOf('/');
  const name = file.path.slice(slash + 1);
  const folder = slash === -1 ? '' : file.path.slice(0, slash + 1);
  const status = file.kind === 'modified' ? '' : t.memoryFileChange[file.kind];
  return (
    <View
      style={{
        backgroundColor: theme.overlay.fill,
        paddingHorizontal: space.x3,
        paddingVertical: space.x2,
      }}
    >
      <Pressable
        testID={`memory-commit-file-${file.path}`}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={[
          file.path,
          t.memoryFileChange[file.kind],
          ...(file.binary ? [] : [t.memoryDiffCounts(file.added, file.removed)]),
        ].join(', ')}
        onPress={onToggle}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.x3,
          minHeight: theme.touch,
          paddingHorizontal: space.x4,
          paddingVertical: space.x2,
          borderRadius: radius.md,
          backgroundColor: pressed ? theme.layer.raised.pressed : theme.layer.raised.fill,
        })}
      >
        <View style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}>
          <ChevronRightIcon color={theme.color.muted} size={theme.type.meta.line} />
        </View>
        <Text numberOfLines={1} style={{ flex: 1 }}>
          {folder === '' ? null : <Text tone="muted">{folder}</Text>}
          <Text strong>{name}</Text>
        </Text>
        {status === '' ? null : (
          <Text variant="meta" strong tone={file.kind === 'deleted' ? 'danger' : 'success'}>
            {status}
          </Text>
        )}
        {file.binary ? null : <DiffCounts added={file.added} removed={file.removed} />}
      </Pressable>
    </View>
  );
}

function DiffCounts({ added, removed }: { added: number; removed: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: space.x2 }}>
      <Text variant="meta" strong tone="success">{`+${added}`}</Text>
      <Text variant="meta" strong tone="danger">{`−${removed}`}</Text>
    </View>
  );
}

type Section = { file: MemoryCommitFile; open: boolean; data: (MemoryDiffRow | 'note')[] };

export function MemoryCommitView({ load }: { load: () => Promise<MemoryCommit> }) {
  const t = useStrings();
  const theme = useDesignTheme();
  const { state, read, mount } = useLoad<
    MemoryCommit,
    SectionList<MemoryDiffRow | 'note', Section>
  >(load);
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set());
  const commit = state.status === 'ready' ? state.value : undefined;
  const sections: Section[] = (commit?.files ?? []).map((file) => {
    const open = !closed.has(file.path);
    return {
      file,
      open,
      data: !open ? [] : file.binary || file.rows.length === 0 ? ['note'] : file.rows,
    };
  });
  const toggle = (path: string) =>
    setClosed((previous) => {
      const next = new Set(previous);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  const added = commit?.files.reduce((sum, file) => sum + file.added, 0) ?? 0;
  const removed = commit?.files.reduce((sum, file) => sum + file.removed, 0) ?? 0;
  return (
    <SectionList<MemoryDiffRow | 'note', Section>
      ref={mount}
      testID="memory-commit"
      sections={sections}
      keyExtractor={(row) =>
        row === 'note'
          ? 'note'
          : row.kind === 'hunk'
            ? row.header
            : `${row.change}:${row.oldLine}:${row.newLine}`
      }
      stickySectionHeadersEnabled
      style={{ flex: 1, backgroundColor: theme.overlay.fill }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ paddingBottom: space.x6 }}
      refreshing={false}
      onRefresh={read}
      ListHeaderComponent={
        commit === undefined ? undefined : (
          <View
            style={{
              paddingHorizontal: space.x5,
              paddingTop: space.x4,
              paddingBottom: space.x3,
              gap: space.x2,
            }}
          >
            <Text variant="title" strong selectable>
              {commit.subject}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x3 }}>
              <Text variant="meta" tone="muted">
                {t.memoryChangeFiles(commit.files.length)}
              </Text>
              <DiffCounts added={added} removed={removed} />
            </View>
          </View>
        )
      }
      renderSectionHeader={({ section }) => (
        <FileHeader
          file={section.file}
          open={section.open}
          onToggle={() => toggle(section.file.path)}
        />
      )}
      renderSectionFooter={({ section }) =>
        section.open ? <View style={{ height: space.x3 }} /> : null
      }
      renderItem={({ item, section }) =>
        item === 'note' ? (
          <Text
            variant="meta"
            tone="muted"
            style={{ paddingHorizontal: space.x5, paddingVertical: space.x2 }}
          >
            {section.file.binary ? t.memoryChangeBinary : t.memoryChangeNoText}
          </Text>
        ) : (
          <DiffRow row={item} />
        )
      }
      ListEmptyComponent={
        state.status === 'ready' ? (
          <Text tone="muted" style={{ padding: space.x5 }}>
            {t.memoryChangeNoFiles}
          </Text>
        ) : (
          <Status state={state} onRetry={read} />
        )
      }
    />
  );
}
