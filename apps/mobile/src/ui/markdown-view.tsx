import { memo, useMemo } from 'react';
import { Linking } from 'react-native';
import { EnrichedMarkdownText, type LinkPressEvent } from 'react-native-enriched-markdown';
import remend from 'remend';

import { useDesignTheme } from './design/theme';
import { markdownStyle } from './markdown-style';

const flags = { latexMath: false } as const;
const openLink = ({ url }: LinkPressEvent) => void Linking.openURL(url).catch(() => undefined);

export const MarkdownView = memo(function MarkdownView({
  source,
  color,
  selectable = true,
  streaming = false,
}: {
  source: string;
  color?: string;
  selectable?: boolean;
  streaming?: boolean;
}) {
  const theme = useDesignTheme();
  const ink = color ?? theme.color.fg;
  const style = useMemo(() => markdownStyle(theme, ink), [theme, ink]);
  const markdown = useMemo(() => (streaming ? remend(source) : source), [source, streaming]);
  return (
    <EnrichedMarkdownText
      markdown={markdown}
      markdownStyle={style}
      flavor="github"
      selectable={selectable}
      md4cFlags={flags}
      enableTaskListItemToggle={false}
      onLinkPress={openLink}
    />
  );
});
