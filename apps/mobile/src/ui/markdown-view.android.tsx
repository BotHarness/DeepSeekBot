import { memo, useCallback, useContext, useMemo, useState } from 'react';
import { Linking, View, useWindowDimensions } from 'react-native';
import Animated from 'react-native-reanimated';
import { EnrichedMarkdownText, type LinkPressEvent } from 'react-native-enriched-markdown';

import { useDesignTheme } from './design/theme';
import { createMarkdownBlocks, textMarkdownSupported, type MarkdownBlock } from './markdown-blocks';
import { markdownBlockContent } from './markdown-block-content';
import { MarkdownText } from './markdown-text';
import { markdownStyle } from './markdown-style';
import { pressLink } from './link-press';
import { space } from './design/tokens';
import { MarkdownViewportContext, useMarkdownViewport } from './markdown-viewport';
import { createMarkdownWindow } from './markdown-window';
import {
  MarkdownBlockWindow,
  nativeMarkdownWindow,
} from './primitives/markdown-block-window.android';

const flags = { latexMath: false } as const;
const openLink = (url: string) => void Linking.openURL(url).catch(() => undefined);

const MarkdownBlockView = memo(function MarkdownBlockView({
  block,
  color,
  selectable,
  trailing,
  streaming,
  onOpenLink,
}: {
  block: MarkdownBlock;
  color: string;
  selectable: boolean;
  trailing: boolean;
  streaming: boolean;
  onOpenLink: (url: string) => void;
}) {
  const theme = useDesignTheme();
  const style = useMemo(() => markdownStyle(theme, color), [theme, color]);
  const linkPressed = useCallback(
    ({ url }: LinkPressEvent) => pressLink(onOpenLink, url),
    [onOpenLink],
  );
  const { markdown, tokens } = useMemo(
    () => markdownBlockContent(block, streaming),
    [block, streaming],
  );
  if (textMarkdownSupported(tokens))
    return (
      <View style={{ marginBottom: trailing ? space.x3 : 0 }}>
        <MarkdownText
          tokens={tokens}
          color={color}
          selectable={selectable}
          reveal={streaming}
          onOpenLink={onOpenLink}
        />
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
      onLinkPress={linkPressed}
    />
  );
});

type MarkdownProps = {
  source: string;
  color?: string;
  selectable?: boolean;
  streaming?: boolean;
  onOpenLink?: (url: string) => void;
};

export const MarkdownView = memo(function MarkdownView(props: MarkdownProps) {
  const { width, fontScale } = useWindowDimensions();
  if (nativeMarkdownWindow)
    return <NativeMarkdownDocument key={`${width}:${fontScale}`} {...props} />;
  return <MarkdownDocument key={`${width}:${fontScale}`} {...props} />;
});

const NativeMarkdownDocument = memo(function NativeMarkdownDocument({
  source,
  color,
  selectable = true,
  streaming = false,
  onOpenLink = openLink,
}: MarkdownProps) {
  const theme = useDesignTheme();
  const stage = useContext(MarkdownViewportContext);
  const parse = useMemo(() => createMarkdownBlocks(), []);
  const blocks = useMemo(() => parse(source), [parse, source]);
  const supported = useMemo(
    () =>
      blocks
        .slice(0, -1)
        .every((block) => textMarkdownSupported(markdownBlockContent(block, false).tokens)),
    [blocks],
  );
  return (
    <View>
      {blocks.map((block, index) => (
        <MarkdownBlockWindow
          key={`${block.key}:${index < blocks.length - 1 ? block.source : 'tail'}`}
          eligible={stage?.active === true && supported && index < blocks.length - 1}
        >
          <MarkdownBlockView
            block={block}
            color={color ?? theme.color.fg}
            selectable={selectable}
            trailing={index < blocks.length - 1}
            streaming={streaming && index === blocks.length - 1}
            onOpenLink={onOpenLink}
          />
        </MarkdownBlockWindow>
      ))}
    </View>
  );
});

const MarkdownDocument = memo(function MarkdownDocument({
  source,
  color,
  selectable = true,
  streaming = false,
  onOpenLink = openLink,
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
            block={block}
            color={color ?? theme.color.fg}
            selectable={selectable}
            trailing={index < blocks.length - 1}
            streaming={streaming && index === blocks.length - 1}
            onOpenLink={onOpenLink}
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
              block={part.block}
              color={color ?? theme.color.fg}
              selectable={selectable}
              trailing={part.index < blocks.length - 1}
              streaming={streaming && part.index === blocks.length - 1}
              onOpenLink={onOpenLink}
            />
          </View>
        ),
      )}
    </Animated.View>
  );
});
