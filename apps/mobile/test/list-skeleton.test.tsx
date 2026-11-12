// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

vi.mock('react-native', async () => {
  const shim = await import('./react-native-shim');
  return {
    ...shim,
    View: ({
      children,
      testID,
      style,
    }: {
      children?: ReactNode;
      testID?: string;
      style?: object;
    }) => (
      <div data-testid={testID} data-style={JSON.stringify(style ?? {})}>
        {children}
      </div>
    ),
  };
});

import { space } from '../src/ui/design/tokens';
import { ListSkeleton } from '../src/ui/primitives/list-skeleton';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function style(layout: 'list' | 'messages') {
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => root.render(<ListSkeleton layout={layout} />));
  const id = layout === 'messages' ? 'message-skeleton' : 'list-skeleton';
  const found = JSON.parse(
    container.querySelector<HTMLElement>(`[data-testid="${id}"]`)!.dataset['style']!,
  ) as { padding?: number; paddingBottom?: number };
  act(() => root.unmount());
  return found;
}

it('ends message placeholders at the same gap as the last real message row', () => {
  expect(style('messages').paddingBottom).toBe(space.x2);
  expect(style('list').paddingBottom).toBeUndefined();
  expect(style('list').padding).toBe(space.x5);
});
