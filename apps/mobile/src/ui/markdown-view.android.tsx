import { memo, useContext, useMemo } from 'react';
import { Linking, View, useWindowDimensions } from 'react-native';

import { useDesignTheme } from './design/theme';
import { createMarkdownBlocks, textMarkdownSupported } from './markdown-blocks';
import { markdownBlockContent } from './markdown-block-content';
import { MarkdownBlockView, MarkdownDocument, type MarkdownProps } from './markdown-document';
import { MarkdownViewportContext } from './markdown-viewport';
import {
  MarkdownBlockWindow,
  nativeMarkdownWindow,
} from './primitives/markdown-block-window.android';

const openLink = (url: string) => void Linking.openURL(url).catch(() => undefined);

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
