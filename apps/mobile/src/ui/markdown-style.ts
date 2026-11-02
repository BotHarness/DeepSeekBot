import type { MarkdownStyle } from 'react-native-enriched-markdown';

import { edge, radius, space } from './design/tokens';
import { messageColors } from './design/controls';
import type { DesignTheme } from './design/theme';

export function markdownStyle(theme: DesignTheme, ink: string): MarkdownStyle {
  const body = {
    color: ink,
    fontSize: theme.type.body.size,
    lineHeight: theme.type.body.line,
    marginTop: 0,
    marginBottom: space.x3,
  };
  const heading = {
    ...body,
    fontWeight: theme.weight.strong,
    fontSize: theme.type.title.size,
    lineHeight: theme.type.title.line,
  };
  const code = theme.layer.raised.inset;
  const colors = messageColors(theme);
  return {
    paragraph: body,
    h1: heading,
    h2: heading,
    h3: heading,
    h4: heading,
    h5: heading,
    h6: heading,
    list: {
      ...body,
      bulletColor: ink,
      markerColor: ink,
      gapWidth: space.x2,
      marginLeft: space.x5,
      itemSpacing: space.x2,
    },
    blockquote: {
      ...body,
      color: colors.muted,
      borderColor: theme.color.border,
      borderWidth: edge.focus,
      gapWidth: space.x3,
      backgroundColor: 'transparent',
    },
    codeBlock: {
      ...body,
      color: colors.code,
      fontFamily: theme.mono,
      fontSize: theme.type.meta.size,
      lineHeight: theme.type.meta.line,
      backgroundColor: code,
      borderWidth: 0,
      borderRadius: radius.sm,
      padding: space.x3,
    },
    code: {
      fontFamily: theme.mono,
      color: colors.code,
      backgroundColor: code,
      borderColor: 'transparent',
    },
    link: { color: colors.link, underline: true },
    strong: { color: ink },
    em: { color: ink },
    strikethrough: { color: ink },
    taskList: {
      checkedColor: theme.color.accent,
      borderColor: theme.color.borderStrong,
      checkmarkColor: theme.color.onAccent,
      checkedTextColor: theme.color.muted,
    },
    thematicBreak: {
      color: theme.layer.raised.divider,
      height: edge.hairline,
      marginTop: space.x2,
      marginBottom: space.x3,
    },
    table: {
      ...body,
      fontSize: theme.type.meta.size,
      lineHeight: theme.type.meta.line,
      headerBackgroundColor: code,
      headerTextColor: ink,
      rowEvenBackgroundColor: 'transparent',
      rowOddBackgroundColor: 'transparent',
      borderColor: theme.layer.raised.divider,
      borderWidth: edge.hairline,
      borderRadius: radius.sm,
      cellPaddingHorizontal: space.x3,
      cellPaddingVertical: space.x2,
    },
  };
}
