// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({ reduced: false, props: [] as Record<string, unknown>[] }));
vi.mock('expo', () => ({
  requireOptionalNativeModule: () => ({}),
  requireNativeView: () => (props: Record<string, unknown>) => {
    native.props.push(props);
    return <div>{props.children as never}</div>;
  },
}));
vi.mock('react-native', () => ({
  View: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  StyleSheet: { flatten: (style: unknown) => style },
  processColor: () => -1,
}));
vi.mock('react-native-reanimated', () => ({ useReducedMotion: () => native.reduced }));
import { StreamSurface } from '../src/ui/primitives/stream-surface.android';

beforeEach(() => {
  native.reduced = false;
  native.props.length = 0;
});
it('keeps text in a single native paint surface and passes corner geometry', () => {
  const html = renderToStaticMarkup(
    <StreamSurface active style={{ borderRadius: 16, borderBottomLeftRadius: 4 }}>
      <span>Live text</span>
    </StreamSurface>,
  );
  expect(html.match(/Live text/g)).toHaveLength(1);
  expect(native.props).toHaveLength(1);
  expect(native.props[0]).toMatchObject({ active: true, duration: 120, corners: [16, 16, 16, 4] });
});
it.each([false, true])(
  'uses ordinary static layout when inactive or reduced (reduced=%s)',
  (reduced) => {
    native.reduced = reduced;
    expect(
      renderToStaticMarkup(
        <StreamSurface active={reduced}>
          <span>Readable</span>
        </StreamSurface>,
      ),
    ).toContain('Readable');
    expect(native.props).toHaveLength(0);
  },
);
it('retains percentage corner semantics through the ordinary View fallback', () => {
  renderToStaticMarkup(
    <StreamSurface active style={{ borderRadius: '50%' }}>
      <span>Content</span>
    </StreamSurface>,
  );
  expect(native.props).toHaveLength(0);
});
