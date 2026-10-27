// @vitest-environment jsdom
import { createElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';

const device = vi.hoisted(() => ({ os: 'ios' }));
vi.mock('react-native', async () => ({
  ...(await import('./react-native-shim')),
  Platform: {
    get OS() {
      return device.os;
    },
  },
  View: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
}));
vi.mock('../src/ui/primitives/text', () => ({
  Text: ({ children, testID }: { children: ReactNode; testID?: string }) =>
    createElement('span', { 'data-testid': testID }, children),
}));
vi.mock('../src/ui/shell/navigation-action', () => ({
  NavigationAction: (props: { label: string; onPress(): void }) =>
    createElement('button', { 'aria-label': props.label }),
}));
vi.mock('../src/ui/shell/header-icon-button', () => ({
  HeaderIconButton: (props: { label: string; children: ReactNode }) =>
    createElement('button', { 'aria-label': props.label }, props.children),
}));

const { viewerHeaderOptions } = await import('../src/ui/shell/viewer-header');

const theme = { color: { fg: '#111' }, touch: 44 } as never;
const close = vi.fn();
const handBack = vi.fn();
const action = {
  key: 'hand-back',
  label: 'Hand back',
  symbol: { type: 'sfSymbol' as const, name: 'hand.raised.slash' as const },
  icon: createElement('i'),
  onPress: handBack,
};

beforeEach(() => {
  close.mockClear();
  handBack.mockClear();
});

it('puts the viewer in the native iOS navigation bar with system bar buttons', () => {
  device.os = 'ios';
  const options = viewerHeaderOptions({
    theme,
    title: 'Ada · Browser',
    status: 'Ada is browsing',
    driving: false,
    closeLabel: 'Close the Browser',
    onClose: close,
    action,
  }) as {
    headerShown: boolean;
    headerBackVisible: boolean;
    headerTitle(): ReactElement;
    unstable_headerLeftItems(): { label: string; icon: unknown; onPress(): void }[];
    unstable_headerRightItems(): { label: string; icon: unknown; onPress(): void }[];
  };
  expect(options.headerShown).toBe(true);
  expect(options.headerBackVisible).toBe(false);
  const [leading] = options.unstable_headerLeftItems();
  expect(leading).toMatchObject({
    label: 'Close the Browser',
    icon: { type: 'sfSymbol', name: 'xmark' },
  });
  leading!.onPress();
  expect(close).toHaveBeenCalledTimes(1);
  const [trailing] = options.unstable_headerRightItems();
  expect(trailing).toMatchObject({ label: 'Hand back', icon: action.symbol });
  trailing!.onPress();
  expect(handBack).toHaveBeenCalledTimes(1);
  const title = renderToStaticMarkup(options.headerTitle());
  expect(title).toContain('Ada · Browser');
  expect(title).toContain('Ada is browsing');
});

it('uses the Material top app bar on Android and leaves the trailing slot empty without an action', () => {
  device.os = 'android';
  const options = viewerHeaderOptions({
    theme,
    title: 'Ada · Computer',
    status: '',
    driving: false,
    closeLabel: 'Close the Computer',
    onClose: close,
  }) as {
    headerShown: boolean;
    headerLeft(): ReactElement;
    headerRight(): ReactElement | null;
    unstable_headerLeftItems?: unknown;
  };
  expect(options.headerShown).toBe(true);
  expect(options.unstable_headerLeftItems).toBeUndefined();
  expect(renderToStaticMarkup(options.headerLeft())).toContain('Close the Computer');
  expect(options.headerRight()).toBeNull();
});
