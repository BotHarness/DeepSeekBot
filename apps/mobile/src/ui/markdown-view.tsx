import { Fragment, useMemo } from 'react';
import { Linking, Platform, ScrollView, Text, View, type TextStyle } from 'react-native';

import { parseMarkdown, type Block, type Inline } from './markdown';
import { edge, radius, space } from './design/tokens';
import { useDesignTheme, type DesignTheme } from './design/theme';

const mono = Platform.select({ ios: 'Menlo', default: 'monospace' });

export function MarkdownView({ source, color }: { source: string; color?: string }) {
  const theme = useDesignTheme();
  const blocks = useMemo(() => parseMarkdown(source), [source]);
  const base: TextStyle = {
    color: color ?? theme.color.fg,
    fontSize: theme.type.body.size,
    lineHeight: theme.type.body.line,
  };
  return (
    <View style={{ gap: space.x3 }}>
      {blocks.map((block, index) => (
        <BlockView key={index} block={block} base={base} theme={theme} />
      ))}
    </View>
  );
}

function BlockView({ block, base, theme }: { block: Block; base: TextStyle; theme: DesignTheme }) {
  switch (block.type) {
    case 'paragraph':
      return (
        <Text selectable style={base}>
          <Inlines nodes={block.children} theme={theme} />
        </Text>
      );
    case 'heading':
      return (
        <Text
          selectable
          accessibilityRole="header"
          style={{
            ...base,
            fontWeight: theme.weight.strong,
            fontSize: theme.type.title.size,
            lineHeight: theme.type.title.line,
          }}
        >
          <Inlines nodes={block.children} theme={theme} />
        </Text>
      );
    case 'code':
    case 'table':
      return (
        <ScrollView
          horizontal
          style={{ backgroundColor: theme.color.hover, borderRadius: radius.sm }}
          contentContainerStyle={{ padding: space.x3 }}
        >
          <Text
            selectable
            style={{
              color: base.color,
              fontFamily: mono,
              fontSize: theme.type.meta.size,
              lineHeight: theme.type.meta.line,
            }}
          >
            {block.text}
          </Text>
        </ScrollView>
      );
    case 'quote':
      return (
        <View
          style={{
            borderLeftWidth: edge.focus,
            borderLeftColor: theme.color.border,
            paddingLeft: space.x3,
            gap: space.x3,
          }}
        >
          {block.children.map((child, index) => (
            <BlockView
              key={index}
              block={child}
              base={{ ...base, color: theme.color.muted }}
              theme={theme}
            />
          ))}
        </View>
      );
    case 'list':
      return (
        <View style={{ gap: space.x2 }}>
          {block.items.map((item, index) => (
            <View key={index} style={{ flexDirection: 'row', gap: space.x2 }}>
              <Text style={{ ...base, minWidth: block.ordered ? 22 : 12 }}>
                {block.ordered ? `${block.start + index}.` : '•'}
              </Text>
              <View style={{ flex: 1, gap: space.x2 }}>
                {item.map((child, childIndex) => (
                  <BlockView key={childIndex} block={child} base={base} theme={theme} />
                ))}
              </View>
            </View>
          ))}
        </View>
      );
    case 'rule':
      return (
        <View
          style={{
            height: edge.hairline,
            backgroundColor: theme.color.divider,
            marginVertical: space.x2,
          }}
        />
      );
  }
}

function Inlines({ nodes, theme }: { nodes: readonly Inline[]; theme: DesignTheme }) {
  return (
    <>
      {nodes.map((node, index) => (
        <InlineView key={index} node={node} theme={theme} />
      ))}
    </>
  );
}

function InlineView({ node, theme }: { node: Inline; theme: DesignTheme }) {
  switch (node.type) {
    case 'text':
      return <Fragment>{node.text}</Fragment>;
    case 'break':
      return <Fragment>{'\n'}</Fragment>;
    case 'code':
      return (
        <Text style={{ fontFamily: mono, backgroundColor: theme.color.hover }}>{node.text}</Text>
      );
    case 'strong':
      return (
        <Text style={{ fontWeight: theme.weight.strong }}>
          <Inlines nodes={node.children} theme={theme} />
        </Text>
      );
    case 'em':
      return (
        <Text style={{ fontStyle: 'italic' }}>
          <Inlines nodes={node.children} theme={theme} />
        </Text>
      );
    case 'del':
      return (
        <Text style={{ textDecorationLine: 'line-through' }}>
          <Inlines nodes={node.children} theme={theme} />
        </Text>
      );
    case 'link':
      return (
        <Text
          accessibilityRole="link"
          style={{ color: theme.color.accent, textDecorationLine: 'underline' }}
          onPress={() => void Linking.openURL(node.href).catch(() => undefined)}
        >
          <Inlines nodes={node.children} theme={theme} />
        </Text>
      );
  }
}
