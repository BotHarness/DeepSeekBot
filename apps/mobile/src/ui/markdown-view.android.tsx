import { memo, useMemo, useState } from 'react';
import { Linking, View, useWindowDimensions } from 'react-native';
import Animated from 'react-native-reanimated';
import { EnrichedMarkdownText, type LinkPressEvent } from 'react-native-enriched-markdown';
import { Lexer } from 'marked';
import remend from 'remend';

import { useDesignTheme } from './design/theme';
import { createMarkdownBlocks, textMarkdownSupported } from './markdown-blocks';
import { MarkdownText } from './markdown-text';
import { markdownStyle } from './markdown-style';
import { space } from './design/tokens';
import { useMarkdownViewport } from './markdown-viewport';
import { createMarkdownWindow } from './markdown-window';

const flags = { latexMath: false } as const;
const openLink = ({ url }: LinkPressEvent) => void Linking.openURL(url).catch(() => undefined);

const MarkdownBlockView = memo(function MarkdownBlockView({
  source,
  color,
  selectable,
  trailing,
  streaming,
}: {
  source: string;
  color: string;
  selectable: boolean;
  trailing: boolean;
  streaming: boolean;
}) {
  const theme = useDesignTheme();
  const style = useMemo(() => markdownStyle(theme, color), [theme, color]);
  const markdown = useMemo(() => (streaming ? remend(source) : source), [source, streaming]);
  const tokens = useMemo(() => Lexer.lex(markdown, { gfm: true }), [markdown]);
  if (textMarkdownSupported(tokens))
    return (
      <View style={{ marginBottom: trailing ? space.x3 : 0 }}>
        <MarkdownText tokens={tokens} color={color} selectable={selectable} reveal={streaming} />
      </View>
    );
  return (
    <EnrichedMarkdownText
      markdown={markdown}
      markdownStyle={style}
      flavor="github"
      selectable={selectable}
      md4cFlags={flags}
      allowTrailingMargin={trailing}
      enableTaskListItemToggle={false}
      onLinkPress={openLink}
    />
  );
});

type MarkdownProps = {
  source: string;
  color?: string;
  selectable?: boolean;
  streaming?: boolean;
};

export const MarkdownView = memo(function MarkdownView(props: MarkdownProps) {
  const { width, fontScale } = useWindowDimensions();
  return <MarkdownDocument key={`${width}:${fontScale}`} {...props} />;
});

const MarkdownDocument = memo(function MarkdownDocument({
  source,
  color,
  selectable = true,
  streaming = false,
}: MarkdownProps) {
  const theme = useDesignTheme();
  const parse = useMemo(() => createMarkdownBlocks(), []);
  const blocks = useMemo(() => parse(source), [parse, source]);
  const viewport = useMarkdownViewport();
  const window = useMemo(() => createMarkdownWindow(), []);
  const [, measureVersion] = useState(0);
  const parts = window.project(blocks, viewport.visible);
  if (!viewport.enabled)
    return (
      <View>
        {blocks.map((block, index) => (
          <MarkdownBlockView
            key={block.key}
            source={block.source}
            color={color ?? theme.color.fg}
            selectable={selectable}
            trailing={index < blocks.length - 1}
            streaming={streaming && index === blocks.length - 1}
          />
        ))}
      </View>
    );
  return (
    <Animated.View
      ref={viewport.ref}
      collapsable={false}
      onLayout={viewport.onLayout}
      style={
        parts.some((part) => part.kind === 'space') && viewport.width > 0
          ? { minWidth: viewport.width, maxWidth: '100%' }
          : undefined
      }
    >
      {parts.map((part) =>
        part.kind === 'space' ? (
          <View key={`space:${part.key}`} style={{ height: part.height }} />
        ) : (
          <View
            key={part.block.key}
            onLayout={(event) => {
              if (
                window.measure(
                  part.block,
                  part.index < blocks.length - 1,
                  event.nativeEvent.layout.height,
                )
              )
                measureVersion((version) => version + 1);
            }}
          >
            <MarkdownBlockView
              source={part.block.source}
              color={color ?? theme.color.fg}
              selectable={selectable}
              trailing={part.index < blocks.length - 1}
              streaming={streaming && part.index === blocks.length - 1}
            />
          </View>
        ),
      )}
    </Animated.View>
  );
});
