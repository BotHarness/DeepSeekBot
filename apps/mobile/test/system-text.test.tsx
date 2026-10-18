// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const device = vi.hoisted(() => ({ os: 'ios', scale: 1 }));
vi.mock('react-native', async () => ({
  ...(await import('./react-native-shim')),
  Platform: {
    get OS() {
      return device.os;
    },
  },
  useWindowDimensions: () => ({ width: 390, height: 844, scale: 3, fontScale: device.scale }),
  Text: ({
    style,
    allowFontScaling,
    dynamicTypeRamp,
    maxFontSizeMultiplier,
    children,
  }: Record<string, unknown>) => (
    <span
      data-metrics={JSON.stringify(style)}
      data-ramp={dynamicTypeRamp as string}
      data-maximum={maxFontSizeMultiplier as number}
      data-native-scaling={String(allowFontScaling)}
    >
      {children as string}
    </span>
  ),
  TextInput: ({ style, allowFontScaling, value, onChangeText }: Record<string, unknown>) => (
    <textarea
      data-metrics={JSON.stringify(style)}
      data-native-scaling={String(allowFontScaling)}
      value={value as string}
      onChange={(event) => (onChangeText as (text: string) => void)(event.target.value)}
    />
  ),
}));

import { Text, TextInput } from '../src/ui/primitives/system-text';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
let host: HTMLDivElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  device.os = 'ios';
  device.scale = 1;
});
function render(node: React.ReactNode) {
  if (!root) {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  }
  act(() => root!.render(node));
  return host!;
}

describe('system text size', () => {
  it('uses native semantic curves and renews stale iOS paragraphs after live resizing', () => {
    const first = render(<Text style={{ fontSize: 28 }}>Filter and sort</Text>).querySelector(
      'span',
    )!;
    expect(first.dataset.ramp).toBe('title1');
    device.scale = 3.571;
    const next = render(<Text style={{ fontSize: 28 }}>Filter and sort</Text>).querySelector(
      'span',
    )!;
    expect(next).not.toBe(first);
    expect(next.dataset.ramp).toBe('title1');
    expect(next.dataset.nativeScaling).toBe('undefined');
    expect(JSON.parse(next.dataset.metrics!)).toEqual([{ fontSize: 17 }, { fontSize: 28 }]);
  });

  it('passes explicit roles and maximum overrides to the native text owner', () => {
    const spans = render(
      <Text dynamicTypeRamp="headline" maxFontSizeMultiplier={2}>
        <Text maxFontSizeMultiplier={0}>Unbounded</Text>
      </Text>,
    ).querySelectorAll('span');
    expect(spans[0]!.dataset.ramp).toBe('headline');
    expect(spans[0]!.dataset.maximum).toBe('2');
    expect(spans[1]!.dataset.ramp).toBeUndefined();
    expect(spans[1]!.dataset.maximum).toBe('0');
  });

  it('leaves Android nonlinear scaling and paragraph lifecycle to the native view', () => {
    device.os = 'android';
    const first = render(
      <Text style={{ fontSize: 17, lineHeight: 22 }}>Launch</Text>,
    ).querySelector('span')!;
    device.scale = 2;
    const next = render(<Text style={{ fontSize: 17, lineHeight: 22 }}>Launch</Text>).querySelector(
      'span',
    )!;
    expect(next).toBe(first);
    expect(JSON.parse(next.dataset.metrics!)).toEqual({ fontSize: 17, lineHeight: 22 });
    expect(next.dataset.ramp).toBeUndefined();
    expect(next.dataset.nativeScaling).toBe('undefined');
  });

  it('keeps the input node, draft and focus through a live size change', () => {
    function Draft({ revision }: { revision: number }) {
      const [draft, setDraft] = useState('你好 Ocean');
      return (
        <>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            style={{ fontSize: 17, lineHeight: 22 }}
          />
          {revision}
        </>
      );
    }
    const input = render(<Draft revision={0} />).querySelector('textarea')!;
    input.focus();
    input.setSelectionRange(3, 8);
    device.scale = 3.571;
    render(<Draft revision={1} />);
    expect(host!.querySelector('textarea')).toBe(input);
    expect(input.value).toBe('你好 Ocean');
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(3);
    expect(input.selectionEnd).toBe(8);
    expect(JSON.parse(input.dataset.metrics!)).toEqual([
      { fontSize: 17 },
      { fontSize: 17, lineHeight: 22 },
    ]);
    expect(input.dataset.nativeScaling).toBe('undefined');
  });

  it('keeps decorative initials unscaled and nested text metrics inherited', () => {
    device.scale = 3.571;
    const nodes = render(
      <>
        <Text allowFontScaling={false} style={{ fontSize: 17 }}>
          H
        </Text>
        <Text style={{ fontSize: 20 }}>
          <Text>nested</Text>
        </Text>
      </>,
    ).querySelectorAll('span');
    expect(JSON.parse(nodes[0]!.dataset.metrics!)).toEqual([{ fontSize: 17 }, { fontSize: 17 }]);
    expect(JSON.parse(nodes[1]!.dataset.metrics!)).toEqual([{ fontSize: 17 }, { fontSize: 20 }]);
    expect(nodes[2]!.dataset.metrics).toBeUndefined();
  });
});
