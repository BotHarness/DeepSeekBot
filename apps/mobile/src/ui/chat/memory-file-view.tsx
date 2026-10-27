import { useCallback, useMemo, useRef, useState } from 'react';
import { Lexer } from 'marked';
import { FlatList, View, type ViewInstance } from 'react-native';

import type { HostClient } from '../../host/client';
import type { MemoryPreviewIO } from '../../host/memory-preview';
import type { PinnedRole } from '../../host/bot-profile';
import type { MemoryFile } from '../../host/wire';
import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { Text } from '../primitives/text';
import { Segmented } from '../primitives/segmented';
import { useStrings } from '../strings';
import { MemoryAbout, useLoad, Status } from './memory-browser';
import { MemoryMarkdownBlock } from './memory-markdown';
import { MemoryPreviewImage } from './memory-preview-image';
import { createMemoryVisibility, MemoryVisibility } from './memory-visibility';

export function MemoryFileView({
  load,
  preview,
  role,
}: {
  load: () => Promise<MemoryFile | undefined>;
  preview?: { client: HostClient; io: MemoryPreviewIO; slug: string; path: string };
  role?: PinnedRole | undefined;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const { state, read, mount } = useLoad<MemoryFile | undefined, ViewInstance>(load);
  const [mode, setMode] = useState<'preview' | 'source'>('preview');
  const frame = useRef<ViewInstance | null>(null);
  const visibility = useMemo(() => createMemoryVisibility(() => frame.current), []);
  const attach = useCallback(
    (node: ViewInstance | null) => {
      frame.current = node;
      mount(node);
    },
    [mount],
  );
  const file = state.status === 'ready' ? state.value : undefined;
  const markdown = preview === undefined ? undefined : file?.markdown;
  const rendered = markdown?.status === 'ready' && mode === 'preview';
  const blocks = useMemo(
    () =>
      rendered
        ? Lexer.lex(markdown.body, { gfm: true }).filter(
            (token) => token.type !== 'space' && token.type !== 'def',
          )
        : [],
    [rendered, markdown?.body],
  );
  const content =
    state.status !== 'ready' ? (
      <Status state={state} onRetry={read} />
    ) : file === undefined ? (
      <Text tone="muted">{t.memoryMissing}</Text>
    ) : file.image && preview ? (
      <MemoryPreviewImage
        key={`${file.path}:${file.image.source}:${file.image.revision}`}
        {...preview}
        version={file.image}
        onRefresh={read}
      />
    ) : rendered && preview && markdown ? null : markdown &&
      markdown.status !== 'ready' &&
      mode === 'preview' ? (
      <Text tone="muted">{t.memoryImageError(`memory-image-${markdown.status}`)}</Text>
    ) : file.binary === true ? (
      <Text tone="muted">{t.memoryBinary}</Text>
    ) : file.body.trim() === '' ? (
      <Text tone="muted">{t.memoryEmptyFile}</Text>
    ) : (
      <Text selectable>{file.body}</Text>
    );
  return (
    <View
      ref={attach}
      collapsable={false}
      onLayout={() => visibility.notify()}
      style={{ flex: 1, backgroundColor: theme.overlay.fill }}
    >
      <MemoryVisibility value={visibility}>
        <FlatList
          contentInsetAdjustmentBehavior="automatic"
          data={blocks}
          keyExtractor={(_token, index) => String(index)}
          onScroll={() => visibility.notify()}
          onContentSizeChange={() => visibility.notify()}
          scrollEventThrottle={16}
          refreshing={false}
          onRefresh={read}
          contentContainerStyle={{ padding: space.x5, gap: space.x4 }}
          ListHeaderComponent={
            role === undefined && !markdown ? undefined : (
              <View style={{ gap: space.x4 }}>
                {role === undefined ? null : <MemoryAbout role={role} />}
                {markdown ? (
                  <Segmented<'preview' | 'source'>
                    label={t.memoryViewMode}
                    options={[
                      { value: 'preview', label: t.memoryPreview },
                      { value: 'source', label: t.memorySource },
                    ]}
                    value={mode}
                    onChange={setMode}
                  />
                ) : null}
              </View>
            )
          }
          ListEmptyComponent={
            content === null ? <Text tone="muted">{t.memoryEmptyFile}</Text> : content
          }
          renderItem={({ item, index }) =>
            preview && markdown ? (
              <View
                key={`${file?.path}:${markdown.revision}:${index}`}
                style={{
                  paddingHorizontal: space.x3,
                }}
              >
                <MemoryMarkdownBlock
                  tokens={[item]}
                  {...preview}
                  document={markdown}
                  onRefresh={read}
                />
              </View>
            ) : undefined
          }
        />
      </MemoryVisibility>
    </View>
  );
}
