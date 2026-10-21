import { memo, useMemo } from 'react';
import { Linking, View } from 'react-native';
import { EnrichedMarkdownText, type LinkPressEvent } from 'react-native-enriched-markdown';
import remend from 'remend';

import { useDesignTheme } from './design/theme';
import { createMarkdownBlocks, type MarkdownBlock } from './markdown-blocks';
import { markdownStyle } from './markdown-style';

const flags = { latexMath: false } as const;
const openLink = ({ url }: LinkPressEvent) => void Linking.openURL(url).catch(() => undefined);

type MarkdownProps = {
  source: string;
  color?: string;
  selectable?: boolean;
  streaming?: boolean;
};

const StreamingBlock = memo(function StreamingBlock({
  block,
  color,
  selectable,
  trailing,
  open,
}: {
  block: MarkdownBlock;
  color: string;
  selectable: boolean;
  trailing: boolean;
  open: boolean;
}) {
  const theme = useDesignTheme();
  const style = useMemo(() => markdownStyle(theme, color), [theme, color]);
  const markdown = useMemo(() => (open ? remend(block.source) : block.source), [block, open]);
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

const StreamingMarkdown = memo(function StreamingMarkdown({
  source,
  color,
  selectable,
}: {
  source: string;
  color: string;
  selectable: boolean;
}) {
  const parse = useMemo(() => createMarkdownBlocks(), []);
  const blocks = parse(source);
  return (
    <View>
      {blocks.map((block, index) => (
        <StreamingBlock
          key={block.key}
          block={block}
          color={color}
          selectable={selectable}
          trailing={index < blocks.length - 1}
          open={index === blocks.length - 1}
        />
      ))}
    </View>
  );
});

export const MarkdownView = memo(function MarkdownView({
  source,
  color,
  selectable = true,
  streaming = false,
}: MarkdownProps) {
  const theme = useDesignTheme();
  const ink = color ?? theme.color.fg;
  const style = useMemo(() => markdownStyle(theme, ink), [theme, ink]);
  if (streaming) return <StreamingMarkdown source={source} color={ink} selectable={selectable} />;
  return (
    <EnrichedMarkdownText
      markdown={source}
      markdownStyle={style}
      flavor="github"
      selectable={selectable}
      md4cFlags={flags}
      enableTaskListItemToggle={false}
      onLinkPress={openLink}
    />
  );
});
