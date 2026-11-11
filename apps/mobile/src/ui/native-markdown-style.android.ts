import { normalizeMarkdownStyle } from 'react-native-enriched-markdown/lib/module/normalizeMarkdownStyle';

import type { DesignTheme } from './design/theme';
import { markdownStyle } from './markdown-style';

export function nativeMarkdownStyle(theme: DesignTheme): object | undefined {
  return normalizeMarkdownStyle(markdownStyle(theme, theme.color.fg));
}
