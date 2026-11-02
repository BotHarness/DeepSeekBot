import { decodeHTML } from 'entities';
import type { Token } from 'marked';
import { Linking, View } from 'react-native';

import type { HostClient } from '../../host/client';
import type { MemoryPreviewIO } from '../../host/memory-preview';
import type { MemoryMarkdown } from '../../host/wire';
import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { renderMarkdownInline } from '../markdown-inline';
import { MarkdownText } from '../markdown-text';
import { Text } from '../primitives/text';
import { MemoryPreviewImage } from './memory-preview-image';

export type MemoryInlinePart =
  | { kind: 'text'; tokens: Token[] }
  | { kind: 'image'; href: string; alt: string };
export function memoryInlineParts(tokens: Token[]): MemoryInlinePart[] {
  const parts: MemoryInlinePart[] = [];
  const add = (part: MemoryInlinePart) => {
    const last = parts.at(-1);
    if (part.kind === 'text' && last?.kind === 'text') last.tokens.push(...part.tokens);
    else parts.push(part);
  };
  for (const token of tokens) {
    if (token.type === 'image')
      add({ kind: 'image', href: decodeHTML(token.href), alt: decodeHTML(token.text) });
    else if ('tokens' in token && token.tokens !== undefined) {
      for (const part of memoryInlineParts(token.tokens))
        add(
          part.kind === 'image'
            ? part
            : { kind: 'text', tokens: [{ ...token, tokens: part.tokens }] },
        );
    } else add({ kind: 'text', tokens: [token] });
  }
  return parts;
}
const openLink = (url: string) => {
  if (/^https?:\/\//iu.test(url)) void Linking.openURL(url).catch(() => undefined);
};

export function MemoryMarkdownBlock({
  tokens,
  client,
  io,
  slug,
  path,
  document,
  onRefresh,
}: {
  tokens: Token[];
  client: HostClient;
  io: MemoryPreviewIO;
  slug: string;
  path: string;
  document: MemoryMarkdown;
  onRefresh?: (() => void) | undefined;
}) {
  const theme = useDesignTheme();
  return (
    <MarkdownText
      tokens={tokens}
      color={theme.color.fg}
      selectable
      nativeReveal={false}
      renderInlineBlock={(entries, heading) => (
        <View style={{ gap: space.x3 }}>
          {memoryInlineParts(entries).map((part, index) =>
            part.kind === 'image' ? (
              <MemoryPreviewImage
                key={`${index}:${part.href}`}
                client={client}
                io={io}
                slug={slug}
                path={path}
                version={document}
                reference={part.href}
                alt={part.alt}
                onRefresh={onRefresh}
              />
            ) : (
              <Text
                key={index}
                selectable
                variant={heading ? 'title' : 'body'}
                accessibilityRole={heading ? 'header' : undefined}
              >
                {renderMarkdownInline(part.tokens, theme, false, theme.color.fg, openLink)}
              </Text>
            ),
          )}
        </View>
      )}
    />
  );
}
