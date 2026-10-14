import { Fragment, useMemo } from 'react';
import { Linking, Platform, ScrollView, Text, View, type TextStyle } from 'react-native';

import { parseMarkdown, type Block, type Inline } from './markdown';
import { useTheme, type Theme } from './theme';

const mono = Platform.select({ ios: 'Menlo', default: 'monospace' });

export function MarkdownView({ source, color }: { source: string; color?: string }) {
  const theme = useTheme();
  const blocks = useMemo(() => parseMarkdown(source), [source]);
  const base: TextStyle = { color: color ?? theme.ink, fontSize: 16, lineHeight: 22 };
  return (
    <View style={{ gap: 8 }}>
      {blocks.map((block, index) => (
        <BlockView key={index} block={block} base={base} theme={theme} />
      ))}
    </View>
  );
}

function BlockView({ block, base, theme }: { block: Block; base: TextStyle; theme: Theme }) {
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
            fontWeight: '700',
            fontSize: block.level <= 1 ? 20 : block.level === 2 ? 18 : 16,
            lineHeight: block.level <= 1 ? 26 : 24,
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
          style={{ backgroundColor: theme.codeSurface, borderRadius: 8 }}
          contentContainerStyle={{ padding: 10 }}
        >
          <Text
            selectable
            style={{ color: base.color, fontFamily: mono, fontSize: 13, lineHeight: 19 }}
          >
            {block.text}
          </Text>
        </ScrollView>
      );
    case 'quote':
      return (
        <View
          style={{ borderLeftWidth: 3, borderLeftColor: theme.border, paddingLeft: 10, gap: 8 }}
        >
          {block.children.map((child, index) => (
            <BlockView
              key={index}
              block={child}
              base={{ ...base, color: theme.inkSoft }}
              theme={theme}
            />
          ))}
        </View>
      );
    case 'list':
      return (
        <View style={{ gap: 4 }}>
          {block.items.map((item, index) => (
            <View key={index} style={{ flexDirection: 'row', gap: 6 }}>
              <Text style={{ ...base, minWidth: block.ordered ? 22 : 12 }}>
                {block.ordered ? `${block.start + index}.` : '•'}
              </Text>
              <View style={{ flex: 1, gap: 6 }}>
                {item.map((child, childIndex) => (
                  <BlockView key={childIndex} block={child} base={base} theme={theme} />
                ))}
              </View>
            </View>
          ))}
        </View>
      );
    case 'rule':
      return <View style={{ height: 1, backgroundColor: theme.border, marginVertical: 4 }} />;
  }
}

function Inlines({ nodes, theme }: { nodes: readonly Inline[]; theme: Theme }) {
  return (
    <>
      {nodes.map((node, index) => (
        <InlineView key={index} node={node} theme={theme} />
      ))}
    </>
  );
}

function InlineView({ node, theme }: { node: Inline; theme: Theme }) {
  switch (node.type) {
    case 'text':
      return <Fragment>{node.text}</Fragment>;
    case 'break':
      return <Fragment>{'\n'}</Fragment>;
    case 'code':
      return (
        <Text style={{ fontFamily: mono, fontSize: 14, backgroundColor: theme.codeSurface }}>
          {node.text}
        </Text>
      );
    case 'strong':
      return (
        <Text style={{ fontWeight: '700' }}>
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
          style={{ color: theme.accent, textDecorationLine: 'underline' }}
          onPress={() => void Linking.openURL(node.href).catch(() => undefined)}
        >
          <Inlines nodes={node.children} theme={theme} />
        </Text>
      );
  }
}
