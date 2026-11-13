// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
const image = vi.hoisted(() => ({ props: {} as Record<string, unknown> }));
vi.mock('../src/ui/primitives/system-symbol', () => ({ SystemSymbol: () => null }));
vi.mock('react-native-svg', () => ({
  default: () => null,
  Svg: () => null,
  Path: () => null,
  Circle: () => null,
  Rect: () => null,
  G: () => null,
}));
vi.mock('react-native-reanimated', () => import('./reanimated-shim'));
vi.mock('react-native', async () => import('./react-native-shim'));
vi.mock('../src/ui/chat/media-long-press', () => ({ useMediaLongPress: () => ({}) }));
vi.mock('../src/ui/primitives/resource-image', () => ({
  ResourceImage: (props: Record<string, unknown>) => {
    image.props = props;
    return createElement('div', { 'data-testid': 'image' });
  },
}));
const { MessageAlbum } = await import('../src/ui/chat/message-attachments');
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
it('keeps an already displayed image without another fade when its parent refreshes', async () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  const attachment = {
    key: 'image',
    local: false,
    name: 'test.png',
    kind: 'image' as const,
    mime: 'image/png',
    source: { uri: 'https://example.test/image.png', headers: {} },
  };
  const render = () =>
    root.render(
      <MessageAlbum
        images={[{ ...attachment }]}
        human={false}
        width={300}
        onOpenImage={() => {}}
      />,
    );
  try {
    await act(render);
    const element = container.querySelector('[data-testid="image"]');
    expect(image.props['transition']).toBe(150);
    await act(() => (image.props['onDisplay'] as () => void)());
    expect(image.props['transition']).toBe(0);
    await act(render);
    expect(container.querySelector('[data-testid="image"]')).toBe(element);
    expect(image.props['transition']).toBe(0);
  } finally {
    await act(() => root.unmount());
  }
});
