import { decodeHTML } from 'entities';
import type { Token } from 'marked';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { copyMessage } from './chat/message-menu';
import { edge, radius, space } from './design/tokens';
import { useDesignTheme } from './design/theme';
import { Text } from './primitives/text';
import { StreamReveal, nativeStreamReveal } from './primitives/stream-reveal';
import { renderMarkdownInline } from './markdown-inline';
import { MarkdownTable } from './markdown-table';
import { isMarkdownTable } from './markdown-blocks';
import { t } from './strings';

export function MarkdownText({
  tokens,
  color,
  selectable,
  reveal = false,
  nativeReveal = nativeStreamReveal,
}: {
  tokens: Token[];
  color: string;
  selectable: boolean;
  reveal?: boolean;
  nativeReveal?: boolean;
}) {
  const theme = useDesignTheme();
  const visible = (entries: Token[]) =>
    entries.filter((token) => !['space', 'def', 'checkbox'].includes(token.type));
  const blocks = (entries: Token[], animate: boolean): ReactNode[] => {
    const shown = visible(entries);
    return shown.map((token, index) => block(token, index, animate && index === shown.length - 1));
  };
  const block = (token: Token, index: number, animate: boolean): ReactNode => {
    if (token.type === 'space' || token.type === 'def' || token.type === 'checkbox') return null;
    if (isMarkdownTable(token)) return <MarkdownTable key={index} table={token} color={color} />;
    if (token.type === 'hr')
      return (
        <View
          key={index}
          style={{ height: edge.hairline, backgroundColor: theme.layer.raised.divider }}
        />
      );
    if (token.type === 'blockquote')
      return (
        <View
          key={index}
          style={{
            borderLeftWidth: edge.focus,
            borderLeftColor: theme.color.border,
            paddingLeft: space.x3,
            gap: space.x3,
          }}
        >
          {blocks(token.tokens ?? [], animate)}
        </View>
      );
    if (token.type === 'code')
      return (
        <View
          key={index}
          style={{
            backgroundColor: theme.layer.raised.inset,
            borderRadius: radius.sm,
            overflow: 'hidden',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: space.x3 }}>
            <Text variant="meta" tone="muted" style={{ flex: 1 }} numberOfLines={1}>
              {token.lang ?? ''}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t.copy}
              onPress={() => copyMessage(token.text)}
              style={{
                minWidth: theme.touch,
                minHeight: theme.touch,
                paddingHorizontal: space.x3,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text variant="meta" tone="accent">
                {t.copy}
              </Text>
            </Pressable>
          </View>
          <ScrollView
            horizontal
            style={{ flexGrow: 0 }}
            contentContainerStyle={{ padding: space.x3 }}
          >
            <Text selectable={selectable} variant="meta" style={{ color, fontFamily: theme.mono }}>
              {token.text}
            </Text>
          </ScrollView>
        </View>
      );
    if (token.type === 'list')
      return (
        <View key={index} style={{ marginLeft: space.x5, gap: space.x2 }}>
          {token.items.map(
            (item: { tokens: Token[]; task: boolean; checked?: boolean }, itemIndex: number) => (
              <View
                key={itemIndex}
                style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.x2 }}
              >
                <Text style={{ color: item.task ? theme.color.accent : color }}>
                  {item.task
                    ? item.checked
                      ? '☑'
                      : '☐'
                    : token.ordered
                      ? `${Number(token.start) + itemIndex}.`
                      : '•'}
                </Text>
                <View style={{ flex: 1, gap: token.loose ? space.x3 : 0 }}>
                  {blocks(item.tokens, animate && itemIndex === token.items.length - 1)}
                </View>
              </View>
            ),
          )}
        </View>
      );
    const children = 'tokens' in token ? token.tokens : undefined;
    const text = 'text' in token && typeof token.text === 'string' ? token.text : token.raw;
    const paragraph = (
      <Text
        key={index}
        selectable={selectable}
        variant={token.type === 'heading' ? 'title' : 'body'}
        style={{ color }}
      >
        {children === undefined
          ? decodeHTML(text)
          : renderMarkdownInline(children, theme, animate && !nativeReveal)}
      </Text>
    );
    return nativeReveal ? (
      <StreamReveal key={index} active={animate}>
        {paragraph}
      </StreamReveal>
    ) : (
      paragraph
    );
  };
  return <View style={{ gap: space.x3 }}>{blocks(tokens, reveal)}</View>;
}
