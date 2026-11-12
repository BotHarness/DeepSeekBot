import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { ConversationMessage } from '../src/host/conversation';

const native = vi.hoisted(() => ({
  dismiss: () => {},
  actions: new Map<string, () => void>(),
}));
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
vi.mock('../src/ui/primitives/row-icon', () => ({ rowSymbol: () => ({ ios: 'doc.on.doc' }) }));
vi.mock('../src/ui/design/theme', () => ({
  useDesignTheme: () => ({
    scheme: 'light',
    touch: 44,
    color: { fg: 'black', muted: 'gray' },
    type: { title: { line: 24 } },
    overlay: { fill: 'white' },
    layer: { raised: { fill: 'white', chosen: 'gray' } },
  }),
}));
vi.mock('../src/ui/chat/message-sheet-text', () => ({ MessageSheetText: () => null }));
vi.mock('@expo/ui/swift-ui/modifiers', () => {
  const modifier = () => undefined;
  return {
    accessibilityAddTraits: modifier,
    accessibilityElement: modifier,
    accessibilityLabel: (label: string) => label,
    background: modifier,
    buttonStyle: modifier,
    contentShape: modifier,
    fixedSize: modifier,
    font: modifier,
    foregroundStyle: modifier,
    frame: modifier,
    imageScale: modifier,
    padding: modifier,
    presentationBackground: modifier,
    presentationDragIndicator: modifier,
    shapes: { circle: modifier, roundedRectangle: modifier, rectangle: modifier },
  };
});
vi.mock('@expo/ui/swift-ui', () => {
  const View = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    BottomSheet: ({ children, onDismiss }: { children: ReactNode; onDismiss(): void }) => {
      native.dismiss = onDismiss;
      return <div>{children}</div>;
    },
    Button: ({
      children,
      modifiers,
      onPress,
    }: {
      children: ReactNode;
      modifiers: unknown[];
      onPress(): void;
    }) => {
      const label = modifiers.find((value): value is string => typeof value === 'string');
      if (label !== undefined) native.actions.set(label, onPress);
      return <button>{children}</button>;
    },
    Divider: View,
    Group: View,
    HStack: View,
    Host: View,
    Image: () => null,
    RNHostView: View,
    ScrollView: View,
    Spacer: () => null,
    Text: View,
    VStack: View,
  };
});
const { MessageActions } = await import('../src/ui/chat/message-actions.ios');
const { t } = await import('../src/ui/strings');
const message: ConversationMessage = {
  id: 'synthetic',
  author: 'human',
  body: '  source\n```ts\nx()\n```\n',
  at: '2026-11-12T00:00:00Z',
  attachments: [],
  delivery: 'committed',
};
beforeEach(() => native.actions.clear());

it('opens the original message only after the iOS sheet dismisses, once', () => {
  const onClose = vi.fn();
  const onSelectCopy = vi.fn();
  const onCopy = vi.fn();
  renderToStaticMarkup(
    <MessageActions
      target={{
        message,
        anchor: { x: 0, y: 0, width: 1, height: 1 },
        group: { first: true, last: true },
      }}
      onClose={onClose}
      onSelectCopy={onSelectCopy}
      onCopy={onCopy}
      onReact={() => {}}
      onShareText={() => {}}
    />,
  );
  native.actions.get(t.selectCopy)?.();
  expect(onClose).toHaveBeenCalledOnce();
  expect(onSelectCopy).not.toHaveBeenCalled();
  expect(onCopy).not.toHaveBeenCalled();
  native.dismiss();
  native.dismiss();
  expect(onSelectCopy).toHaveBeenCalledExactlyOnceWith(message);
});

it('does not offer a source page when the caller cannot open one', () => {
  renderToStaticMarkup(
    <MessageActions
      target={{
        message,
        anchor: { x: 0, y: 0, width: 1, height: 1 },
        group: { first: true, last: true },
      }}
      onClose={() => {}}
      onCopy={() => {}}
      onReact={() => {}}
      onShareText={() => {}}
    />,
  );
  expect(native.actions.has(t.selectCopy)).toBe(false);
});
