import { decodeHTML } from 'entities';
import type { Token } from 'marked';
import type { ReactNode } from 'react';
import { Linking } from 'react-native';

import type { DesignTheme } from './design/theme';
import { InlineText } from './primitives/text';
import { FadingText } from './primitives/fading-text';

export function renderMarkdownInline(
  entries: Token[],
  theme: DesignTheme,
  reveal = false,
  color = theme.color.fg,
): ReactNode[] {
  const last = entries.findLastIndex((token) => token.type !== 'br');
  const textNode = (text: string, key: number) =>
    reveal && key === last ? <FadingText key={key} text={text} color={color} /> : text;
  return entries.map((token, index) => {
    if (token.type === 'br') return '\n';
    if (token.type === 'codespan')
      return (
        <InlineText
          key={index}
          style={{ fontFamily: theme.mono, backgroundColor: theme.layer.raised.inset }}
        >
          {textNode(token.text, index)}
        </InlineText>
      );
    if (token.type === 'strong')
      return (
        <InlineText key={index} style={{ fontWeight: theme.weight.strong }}>
          {renderMarkdownInline(token.tokens ?? [], theme, reveal && index === last, color)}
        </InlineText>
      );
    if (token.type === 'em')
      return (
        <InlineText key={index} style={{ fontStyle: 'italic' }}>
          {renderMarkdownInline(token.tokens ?? [], theme, reveal && index === last, color)}
        </InlineText>
      );
    if (token.type === 'del')
      return (
        <InlineText key={index} style={{ textDecorationLine: 'line-through' }}>
          {renderMarkdownInline(token.tokens ?? [], theme, reveal && index === last, color)}
        </InlineText>
      );
    if (token.type === 'link')
      return (
        <InlineText
          key={index}
          accessibilityRole="link"
          style={{ color: theme.color.accent, textDecorationLine: 'underline' }}
          onPress={() => void Linking.openURL(decodeHTML(token.href)).catch(() => undefined)}
        >
          {renderMarkdownInline(
            token.tokens ?? [],
            theme,
            reveal && index === last,
            theme.color.accent,
          )}
        </InlineText>
      );
    if (token.type === 'text' && token.tokens !== undefined)
      return renderMarkdownInline(token.tokens, theme, reveal && index === last, color);
    const text = 'text' in token && typeof token.text === 'string' ? token.text : token.raw;
    return textNode(token.type === 'escape' ? text : decodeHTML(text).replace(/\n/g, ' '), index);
  });
}
