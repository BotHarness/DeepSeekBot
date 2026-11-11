import { memo, useCallback, useMemo } from 'react';
import { Linking, useWindowDimensions } from 'react-native';
import { EnrichedMarkdownText, type LinkPressEvent } from 'react-native-enriched-markdown';
import remend from 'remend';

import { useDesignTheme } from './design/theme';
import { MarkdownDocument, type MarkdownProps } from './markdown-document';
import { markdownStyle } from './markdown-style';
import { pressLink } from './link-press';

const flags = { latexMath: false } as const;
const openLink = (url: string) => void Linking.openURL(url).catch(() => undefined);

const windowed = process.env.EXPO_PUBLIC_IOS_MARKDOWN_WINDOW === '1';

export const MarkdownView = memo(function MarkdownView(props: MarkdownProps) {
  const { width, fontScale } = useWindowDimensions();
  if (windowed) return <MarkdownDocument key={`${width}:${fontScale}`} {...props} />;
  return <WholeMarkdown {...props} />;
});

const WholeMarkdown = memo(function WholeMarkdown({
  source,
  color,
  selectable = true,
  streaming = false,
  onOpenLink = openLink,
}: {
  source: string;
  color?: string;
  selectable?: boolean;
  streaming?: boolean;
  onOpenLink?: (url: string) => void;
}) {
  const theme = useDesignTheme();
  const ink = color ?? theme.color.fg;
  const style = useMemo(() => markdownStyle(theme, ink), [theme, ink]);
  const markdown = useMemo(() => (streaming ? remend(source) : source), [source, streaming]);
  const linkPressed = useCallback(
    ({ url }: LinkPressEvent) => pressLink(onOpenLink, url),
    [onOpenLink],
  );
  return (
    <EnrichedMarkdownText
      markdown={markdown}
      markdownStyle={style}
      flavor="github"
      selectable={selectable}
      md4cFlags={flags}
      enableTaskListItemToggle={false}
      onLinkPress={linkPressed}
    />
  );
});
