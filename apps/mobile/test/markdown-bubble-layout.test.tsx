// @vitest-environment jsdom
import { type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import { beforeEach, expect, it, vi } from 'vitest';
import Yoga, { type Node as YogaNode } from 'yoga-layout';

const native = vi.hoisted(() => ({
  width: 390,
  fontScale: 1,
  styles: new Map<string, { style: ViewStyle & TextStyle; text: boolean; scroll?: boolean }>(),
}));

vi.mock('react-native', async () => {
  const shim = await import('./react-native-shim');
  const isStyleList = (
    style: StyleProp<ViewStyle & TextStyle>,
  ): style is readonly StyleProp<ViewStyle & TextStyle>[] => Array.isArray(style);
  const flatten = (style: StyleProp<ViewStyle & TextStyle>): ViewStyle & TextStyle => {
    if (isStyleList(style)) return Object.assign({}, ...style.map(flatten));
    if (typeof style === 'number') throw new Error('Registered styles need native resolution');
    return style || {};
  };
  const host = (text: boolean, scroll = false) =>
    function NativeNode({
      children,
      style,
    }: {
      children?: ReactNode;
      style?: StyleProp<ViewStyle & TextStyle>;
    }) {
      const id = String(native.styles.size);
      native.styles.set(id, { style: flatten(style), text, scroll });
      return <div data-layout={id}>{children}</div>;
    };
  const Scroll = host(false, true);
  const Content = host(false);
  return {
    ...shim,
    View: host(false),
    Pressable: host(false),
    Text: host(true),
    ScrollView: ({ children, style }: { children?: ReactNode; style?: StyleProp<ViewStyle> }) => (
      <Scroll style={[{ flexGrow: 1, flexShrink: 1, flexDirection: 'row' }, style]}>
        <Content style={{ flexDirection: 'row' }}>{children}</Content>
      </Scroll>
    ),
    Platform: { OS: 'android', select: (options: { android?: unknown }) => options.android },
    useWindowDimensions: () => ({
      width: native.width,
      height: 800,
      scale: 1,
      fontScale: native.fontScale,
    }),
  };
});
vi.mock('react-native-reanimated', async () => {
  const shim = await import('./reanimated-shim');
  const { View } = await import('react-native');
  return { ...shim, default: { ...shim.default, View } };
});
vi.mock('react-native-worklets', () => ({ scheduleOnRN: (callback: () => void) => callback() }));
vi.mock('../src/ui/markdown-view', () => import('../src/ui/markdown-view.android'));
vi.mock('react-native-enriched-markdown', () => ({
  EnrichedMarkdownText: () => {
    throw new Error('Unexpected rich renderer');
  },
}));
vi.mock('../src/ui/primitives/stream-reveal', async () => ({
  nativeStreamReveal: true,
  StreamReveal: (await import('react-native')).View,
}));
vi.mock('../src/ui/chat/message-menu', () => ({
  copyMessage: () => {},
  openMessageMenu: () => {},
}));
vi.mock('../src/ui/chat/message-attachments', () => ({ MessageAttachments: () => null }));
vi.mock('../src/ui/chat/message-reactions', () => ({ ReactionChips: () => null }));
vi.mock('../src/ui/chat/speaker-row', () => ({ SpeakerRow: () => null }));
vi.mock('../src/ui/bot-avatar', () => ({ BotAvatar: () => null }));
vi.mock('../src/ui/haptics', () => ({ haptic: () => {} }));

import { MessageBubble } from '../src/ui/chat/message-bubble';

beforeEach(() => {
  native.width = 390;
  native.fontScale = 1;
  native.styles.clear();
});

function layout(body: string, streaming = false) {
  native.styles.clear();
  const container = document.createElement('div');
  container.innerHTML = renderToStaticMarkup(
    <MessageBubble
      message={{
        id: 'layout',
        at: '',
        author: 'bot',
        body,
        attachments: [],
        delivery: 'committed',
      }}
      streaming={streaming}
    />,
  );
  const config = Yoga.Config.create();
  config.setUseWebDefaults(false);
  const root = Yoga.Node.create(config);
  root.setWidth(native.width);
  const texts: Array<{ body: string; node: YogaNode }> = [];
  const scrolls: YogaNode[] = [];
  const build = (element: Element, parent: YogaNode) => {
    const entry = native.styles.get(element.getAttribute('data-layout') ?? '');
    if (entry === undefined) throw new Error('Layout node was not captured');
    const node = Yoga.Node.create(config);
    parent.insertChild(node, parent.getChildCount());
    const { style } = entry;
    if (entry.scroll) {
      node.setOverflow(Yoga.OVERFLOW_SCROLL);
      scrolls.push(node);
    }
    if (style.flex !== undefined) node.setFlex(style.flex);
    if (style.flexGrow !== undefined) node.setFlexGrow(style.flexGrow);
    if (style.flexShrink !== undefined) node.setFlexShrink(style.flexShrink);
    if (style.flexDirection === 'row') node.setFlexDirection(Yoga.FLEX_DIRECTION_ROW);
    if (typeof style.width === 'number') node.setWidth(style.width);
    if (style.alignSelf === 'stretch') node.setAlignSelf(Yoga.ALIGN_STRETCH);
    if (style.alignSelf === 'flex-start') node.setAlignSelf(Yoga.ALIGN_FLEX_START);
    if (style.alignItems === 'flex-start') node.setAlignItems(Yoga.ALIGN_FLEX_START);
    if (typeof style.maxWidth === 'string' && style.maxWidth.endsWith('%'))
      node.setMaxWidthPercent(Number.parseFloat(style.maxWidth));
    if (typeof style.gap === 'number') node.setGap(Yoga.GUTTER_ALL, style.gap);
    if (typeof style.marginLeft === 'number') node.setMargin(Yoga.EDGE_LEFT, style.marginLeft);
    if (typeof style.paddingHorizontal === 'number')
      node.setPadding(Yoga.EDGE_HORIZONTAL, style.paddingHorizontal);
    if (typeof style.paddingVertical === 'number')
      node.setPadding(Yoga.EDGE_VERTICAL, style.paddingVertical);
    if (entry.text) {
      const value = element.textContent ?? '';
      const glyph = (style.fontSize ?? 16) * native.fontScale;
      const line = (style.lineHeight ?? 24) * native.fontScale;
      node.setMeasureFunc((available, mode) => {
        const natural = Array.from(value).length * glyph;
        const width =
          mode === Yoga.MEASURE_MODE_UNDEFINED
            ? natural
            : mode === Yoga.MEASURE_MODE_EXACTLY
              ? available
              : Math.min(available, natural);
        return { width, height: Math.ceil(natural / Math.max(glyph, width)) * line };
      });
      texts.push({ body: value, node });
    } else {
      for (const child of element.children) build(child, node);
    }
  };
  try {
    for (const child of container.children) build(child, root);
    root.calculateLayout(undefined, undefined, Yoga.DIRECTION_LTR);
    return [
      ...texts.map(({ body, node }) => ({ body, width: node.getComputedWidth() })),
      ...scrolls.map((node) => ({ body: 'TABLE_VIEWPORT', width: node.getComputedWidth() })),
      ...scrolls.map((node) => ({
        body: 'TABLE_CONTENT',
        width: node.getChild(0).getComputedWidth(),
      })),
    ];
  } finally {
    root.freeRecursive();
    config.free();
  }
}

const paragraph = '雨水经过蒸发凝结形成云层并降落到地面。'.repeat(16);

it.each([false, true])(
  'keeps a list-only reply readable inside its actual bubble (streaming=%s)',
  (streaming) => {
    const source = Array.from({ length: 40 }, (_, i) => `${i + 1}. ${paragraph}`).join('\n\n');
    const texts = layout(source, streaming).filter((text) => text.body === paragraph);
    expect(texts).toHaveLength(40);
    for (const text of texts) {
      expect(text.width).toBeGreaterThan(150);
      expect(text.width).toBeLessThan(native.width * 0.8);
    }
  },
);

it.each([320, 390, 600])('wraps nested lists and scaled text at window width %s', (width) => {
  native.width = width;
  native.fontScale = 2;
  const texts = layout(`- ${paragraph}\n  - ${paragraph}`);
  const prose = texts.filter((text) => text.body === paragraph);
  expect(prose).toHaveLength(2);
  for (const text of prose) expect(text.width).toBeGreaterThan(50);
});

it('keeps short list content compact while long prose uses available space', () => {
  const short = layout('- 雨').find((text) => text.body === '雨');
  const long = layout(paragraph).find((text) => text.body === paragraph);
  expect(short).toBeDefined();
  expect(long).toBeDefined();
  expect(short?.width).toBeLessThan(40);
  expect(long?.width).toBeGreaterThan(200);
});

it.each([320, 390, 600].flatMap((width) => [1, 2, 3].map((fontScale) => ({ width, fontScale }))))(
  'contains a wide table at width $width and font scale $fontScale',
  ({ width, fontScale }) => {
    native.width = width;
    native.fontScale = fontScale;
    const header = '| A | B | C | D | E | F |';
    const rule = '|---|---|---|---|---|---|';
    const row = '| 内容 | 内容 | 内容 | 内容 | 内容 | 内容 |';
    for (const streaming of [false, true]) {
      const nodes = layout(`${header}\n${rule}\n${row}`, streaming);
      const viewport = nodes.find((node) => node.body === 'TABLE_VIEWPORT')!;
      const content = nodes.find((node) => node.body === 'TABLE_CONTENT')!;
      expect(viewport).toBeDefined();
      expect(viewport.width).toBeLessThan(width * 0.8);
      expect(viewport.width).toBeGreaterThan(100);
      expect(content.width).toBeGreaterThan(viewport.width);
    }
  },
);

it('keeps multiple and quoted tables independently scrollable alongside prose', () => {
  const table =
    '| A | B | C | D | E | F |\n|---|---|---|---|---|---|\n| 中文 | text | **bold** | `code` | long_value_without_spaces | 42 |';
  const nodes = layout(
    `Before\n\n${table}\n\nBetween\n\n${table
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n')}\n\nAfter`,
  );
  const viewports = nodes.filter((node) => node.body === 'TABLE_VIEWPORT');
  const contents = nodes.filter((node) => node.body === 'TABLE_CONTENT');
  expect(viewports).toHaveLength(2);
  for (const [index, viewport] of viewports.entries()) {
    expect(viewport.width).toBeLessThan(native.width * 0.8);
    expect(contents[index]!.width).toBeGreaterThan(viewport.width);
  }
  for (const body of ['Before', 'Between', 'After'])
    expect(nodes.some((node) => node.body === body)).toBe(true);
});
