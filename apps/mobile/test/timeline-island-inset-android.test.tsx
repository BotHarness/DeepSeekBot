// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

const keyboard = vi.hoisted(() => ({ visible: false }));
vi.mock('react-native', async () => ({
  ...(await import('./react-native-shim')),
  Platform: { OS: 'android', select: (options: { android?: unknown }) => options.android },
}));
vi.mock('react-native-reanimated', () => import('./reanimated-shim'));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 24, left: 0, right: 0 }),
}));
vi.mock('react-native-keyboard-controller', () => ({
  useKeyboardState: (select: (state: { isVisible: boolean }) => boolean) =>
    select({ isVisible: keyboard.visible }),
}));
vi.mock('../src/ui/primitives/keyboard-chat-scroll', () => ({
  useKeyboardChatScroll: () => undefined,
  useKeyboardOverlayStyle: () => undefined,
}));
vi.mock('../src/ui/primitives/button', () => ({ Button: () => null }));
vi.mock('../src/ui/primitives/list-skeleton', () => ({ ListSkeleton: () => null }));
vi.mock('../src/ui/chat/composer-pill', () => ({
  ComposerFollower: () => null,
  ComposerPillContext: { Provider: ({ children }: { children: ReactNode }) => children },
  ComposerSpacer: () => null,
}));
vi.mock('../src/ui/chat/header-chrome', () => ({
  EdgeFade: () => null,
  useChatHeaderHeight: () => 0,
}));
vi.mock('../src/ui/chat/jump-to-latest', () => ({ JumpToLatest: () => null }));
vi.mock('../src/ui/chat/latest-anchor', () => ({ LatestAnchor: undefined }));
vi.mock('../src/ui/chat/native-header', () => ({
  floatingHeader: false,
  glassHeader: false,
  useHeaderOverlap: () => 0,
  useHeaderPadding: () => 0,
}));

import { chatTimelineListLayout } from '../src/ui/chat/chat-timeline-chrome';
import { edgeFade } from '../src/ui/design/tokens';
import { ChatIslandInset } from '../src/ui/primitives/chat-keyboard';
import { useTimelineIslandFloor } from '../src/ui/primitives/chat-scroll.android';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function floor(island: number, open: boolean): number {
  keyboard.visible = open;
  let value = -1;
  function Probe() {
    value = useTimelineIslandFloor();
    return null;
  }
  const root = createRoot(document.createElement('div'));
  act(() =>
    root.render(
      <ChatIslandInset value={island}>
        <Probe />
      </ChatIslandInset>,
    ),
  );
  act(() => root.unmount());
  return value;
}

function bottomInset(islandFloor: number): number {
  const layout = chatTimelineListLayout({
    headerOverlap: 0,
    headerPadding: 56,
    listSafeArea: 0,
    nativeSpacer: false,
    viewportHeight: 800,
    composerHeight: 120,
    islandFloor,
    ready: true,
  });
  return layout.contentContainerStyle.paddingTop as number;
}

it('keeps the newest Android row above the Composer and the island while the keyboard is closed', () => {
  expect(floor(104, false)).toBe(104);
  expect(bottomInset(floor(104, false))).toBe(120 + 104 + edgeFade.bottom);
});

it('lets the open keyboard absorb the island, and adds nothing without one', () => {
  expect(floor(104, true)).toBe(0);
  expect(bottomInset(floor(104, true))).toBe(120 + edgeFade.bottom);
  expect(floor(0, false)).toBe(0);
});
