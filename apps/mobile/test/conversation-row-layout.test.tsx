// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const device = vi.hoisted(() => ({ os: 'android', scale: 1 }));
vi.mock('expo-router', () => ({
  Link: () => {
    throw new Error('Navigation is outside the conversation row layout fixture');
  },
}));
vi.mock('react-native', async () => {
  const shim = await import('./react-native-shim');
  type Props = Record<string, unknown> & { children?: ReactNode };
  const attributes = (props: Props) => ({
    'aria-label': props.accessibilityLabel as string | undefined,
    'data-style': JSON.stringify(
      shim.StyleSheet.flatten(
        typeof props.style === 'function' ? props.style({ pressed: false }) : props.style,
      ),
    ),
  });
  return {
    ...shim,
    Platform: {
      get OS() {
        return device.os;
      },
    },
    useWindowDimensions: () => ({ width: 320, height: 844, scale: 3, fontScale: device.scale }),
    View: (props: Props) => createElement('div', attributes(props), props.children),
    Pressable: (props: Props) =>
      createElement(
        'button',
        {
          ...attributes(props),
          onClick: () => (props.onPress as (() => void) | undefined)?.(),
        },
        props.children,
      ),
    Text: (props: Props) =>
      createElement(
        'span',
        {
          ...attributes(props),
          'data-lines': props.numberOfLines,
          'data-ellipsis': props.ellipsizeMode,
          'data-scaling': String(props.allowFontScaling),
          'data-maximum': props.maxFontSizeMultiplier,
          'data-fit': String(props.adjustsFontSizeToFit),
        },
        props.children,
      ),
  };
});
vi.mock('../src/ui/bot-avatar', () => ({ BotAvatar: () => null }));
vi.mock('../src/ui/chat/group-mark', () => ({ GroupMark: () => null }));
vi.mock('../src/ui/chat/conversation-swipe', () => ({
  ConversationSwipe: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('../src/ui/chat/row-status-glyph', () => ({
  RowStatusGlyph: ({ status }: { status: string }) =>
    status === 'none' ? null : createElement('i', { 'data-status': status }),
}));
vi.mock('../src/ui/shell/host-tile', () => ({ HostGlyph: () => createElement('i') }));
vi.mock('../src/ui/shell/icons', async () => ({
  ...(await import('./shell-icons-shim')),
  CloudIcon: () => createElement('i'),
  ComputerIcon: () => createElement('i'),
}));

import { View } from 'react-native';
import { ConversationRowFrame } from '../src/ui/chat/conversation-row';
import { useDesignTheme } from '../src/ui/design/theme';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
let host: HTMLDivElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
});

const title = 'HarborBot — a long conversation title with 中文';
const preview = '42 — the complete preview remains available when the visible text truncates';
const label = `${title}, ${preview}`;
const onPress = vi.fn();

function Fixture({ time = '12:39', menu = false }: { time?: string; menu?: boolean }) {
  const theme = useDesignTheme();
  return (
    <View style={{ width: 320, flexDirection: 'row' }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <ConversationRowFrame
          title={title}
          source="computer"
          sourceLabel="Research"
          label={label}
          preview={preview}
          time={time}
          status="working"
          avatar={null}
          onPress={onPress}
        />
      </View>
      {menu ? (
        <View accessibilityLabel="Reserved action target" style={{ width: theme.touch }} />
      ) : null}
    </View>
  );
}

function render(time = '12:39', menu = false) {
  if (!root) {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  }
  act(() => root!.render(<Fixture time={time} menu={menu} />));
  const text = (value: string) =>
    [...host!.querySelectorAll('span')].find((el) => el.textContent === value)!;
  return { view: host!, name: text(title), preview: text(preview), time: text(time) };
}

function style(element: Element): Record<string, unknown> {
  return JSON.parse(element.getAttribute('data-style') ?? '{}');
}

describe.each(['android', 'ios'])('Chats row layout contract on %s', (os) => {
  it.each([1, 1.3, 2, 3.571])(
    'keeps two lines at scale %s, including beside an action target',
    (scale) => {
      device.os = os;
      device.scale = scale;
      for (const menu of [false, true]) {
        const row = render('12:39', menu);
        const source = row.name.parentElement!;
        const header = source.parentElement!;
        const content = header.parentElement!;
        expect(style(header)).toMatchObject({ flexDirection: 'row', alignItems: 'center' });
        expect(style(content)).toMatchObject({ flex: 1, minWidth: 0 });
        expect(style(source)).toMatchObject({ flex: 1, minWidth: 0 });
        expect(style(row.name)).toMatchObject({ flexShrink: 1 });
        expect(style(source.children[1]!)).toMatchObject({ flexShrink: 0 });
        expect(source.getAttribute('aria-label')).toContain(title);
        expect(row.name.dataset.ellipsis).toBe('tail');
        expect(row.time.parentElement).toBe(header);
        expect(style(row.time)).toMatchObject({ flexShrink: 0 });
        expect(content.children).toHaveLength(2);
        expect(row.preview.parentElement).toBe(content.children[1]);
        expect(row.preview.parentElement!.querySelector('[data-status="working"]')).not.toBeNull();
        for (const text of [row.name, row.time, row.preview]) {
          expect(text.dataset.lines).toBe('1');
          expect(text.dataset.scaling).not.toBe('false');
          expect(text.dataset.maximum).toBeUndefined();
          expect(text.dataset.fit).not.toBe('true');
        }
        expect(row.view.querySelector('button')!.getAttribute('aria-label')).toBe(label);
        const target = row.view.querySelector('[aria-label="Reserved action target"]');
        expect(target === null).toBe(!menu);
        if (target) expect(style(target).width).toBe(os === 'android' ? 48 : 44);
      }
    },
  );

  it('omits the timestamp slot without adding an empty metadata line', () => {
    device.os = os;
    device.scale = 2;
    const row = render('');
    const header = row.name.parentElement!.parentElement!;
    expect(header.children).toHaveLength(1);
    expect(header.parentElement!.children).toHaveLength(2);
    expect(row.preview.parentElement).toBe(header.nextElementSibling);
    expect(row.view.textContent).not.toContain('12:39');
    onPress.mockClear();
    act(() => row.view.querySelector('button')!.click());
    expect(onPress).toHaveBeenCalledOnce();
  });
});

it('keeps the environment beside the title icon rather than adding a third line', () => {
  render();
  const texts = [...host!.querySelectorAll('span')];
  const name = texts.find((node) => node.textContent === title)!;
  const environment = texts.find((node) => node.textContent === 'Research')!;
  expect(environment.parentElement).toBe(name.parentElement);
  expect(environment.previousElementSibling?.querySelector('i')).not.toBeNull();
});
