// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('./react-native-shim'));
import {
  ComposerLayoutContext,
  useComposerBodyLayout,
  useComposerLayout,
} from '../src/ui/chat/composer-layout';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
afterEach(() => act(() => root?.unmount()));
function mount() {
  let value!: ReturnType<typeof useComposerLayout>;
  function Probe() {
    value = useComposerLayout();
    return null;
  }
  root = createRoot(document.createElement('div'));
  act(() => root!.render(<Probe />));
  return () => value;
}
it('rejects late reports and cleanup from a replaced composer owner', () => {
  const read = mount();
  let old!: ReturnType<ReturnType<typeof useComposerLayout>['controller']['register']>;
  let current!: typeof old;
  act(() => {
    old = read().controller.register('body');
    old.report(184);
  });
  expect(read().height).toBe(184);
  act(() => {
    current = read().controller.register('body');
  });
  expect(read().height).toBeUndefined();
  act(() => current.report(72));
  act(() => {
    old.report(184);
    old.dispose();
  });
  expect(read().height).toBe(72);
  act(() => current.dispose());
  expect(read().height).toBeUndefined();
  act(() => current.report(72));
  expect(read().height).toBeUndefined();
});
it('measures notices independently and removes their height on unmount', () => {
  const read = mount();
  let notice!: ReturnType<ReturnType<typeof useComposerLayout>['controller']['register']>;
  act(() => {
    read().controller.register('body').report(72);
    notice = read().controller.register('notice');
  });
  expect(read().height).toBeUndefined();
  act(() => notice.report(38));
  expect(read().height).toBe(110);
  act(() => notice.report(54));
  expect(read().height).toBe(126);
  act(() => notice.dispose());
  expect(read().height).toBe(72);
});
it('waits for actual non-pill measurements and applies current padding and footer presence', () => {
  let value!: ReturnType<typeof useComposerLayout>;
  let body!: ReturnType<typeof useComposerBodyLayout>;
  function Body({ padding, footer }: { padding: number; footer: boolean }) {
    body = useComposerBodyLayout(padding, footer);
    return null;
  }
  function Probe({ padding = 16, footer = true }: { padding?: number; footer?: boolean }) {
    value = useComposerLayout();
    return (
      <ComposerLayoutContext.Provider value={value.controller}>
        <Body padding={padding} footer={footer} />
      </ComposerLayoutContext.Provider>
    );
  }
  root = createRoot(document.createElement('div'));
  act(() => root!.render(<Probe />));
  act(() => {
    body.measure('pill', 168);
    body.measure('above', 20);
  });
  expect(value.height).toBeUndefined();
  act(() => body.measure('footer', 40));
  expect(value.height).toBe(244);
  act(() => {
    body.measure('pill', 56);
    body.measure('above', 0);
  });
  expect(value.height).toBe(112);
  act(() => root!.render(<Probe padding={30} footer={false} />));
  expect(value.height).toBe(86);
  act(() => root!.render(<Probe padding={30} footer />));
  expect(value.height).toBeUndefined();
  act(() => body.measure('footer', 18));
  expect(value.height).toBe(104);
});
