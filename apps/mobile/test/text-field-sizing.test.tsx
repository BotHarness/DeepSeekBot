// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { resolveTheme } from '../src/ui/design/resolve-theme';

const device = vi.hoisted(() => ({ os: 'ios', scale: 1 }));
vi.mock('react-native', async () => ({
  ...(await import('./react-native-shim')),
  Platform: {
    get OS() {
      return device.os;
    },
  },
}));
vi.mock('../src/ui/design/theme', () => ({
  useDesignTheme: () => ({ ...resolveTheme('light', {}, 'ios'), fontScale: device.scale }),
}));
vi.mock('../src/ui/primitives/system-text', () => ({
  TextInput: ({ style, value }: { style: object[]; value: string }) => (
    <input defaultValue={value} data-style={JSON.stringify(style)} />
  ),
}));
import { TextField, fieldStyle } from '../src/ui/primitives/text-field';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
let host: HTMLDivElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  device.os = 'ios';
  device.scale = 1;
});
it('reserves a scaled line without remounting the focused field or losing its selection', () => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const render = () => act(() => root!.render(<TextField value="你好 Ocean" />));
  render();
  const input = host.querySelector('input')!;
  input.focus();
  input.setSelectionRange(3, 8);
  const initial = JSON.parse(input.dataset.style!)[0].minHeight;
  for (const scale of [2.143, 3.571, 1]) {
    device.scale = scale;
    render();
    const style = JSON.parse(input.dataset.style!)[0];
    expect(host.querySelector('input')).toBe(input);
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe('你好 Ocean');
    expect(input.selectionStart).toBe(3);
    expect(input.selectionEnd).toBe(8);
    expect(style.minHeight).toBeGreaterThanOrEqual(22 * scale + 16 + 2);
    expect(style.fontSize).toBe(17);
  }
  expect(JSON.parse(input.dataset.style!)[0].minHeight).toBe(initial);
});

it('leaves Android intrinsic sizing to the native nonlinear font scaler', () => {
  device.os = 'android';
  const theme = { ...resolveTheme('light', {}, 'android'), fontScale: 3.571 };
  expect(fieldStyle(theme).minHeight).toBe(theme.touch);
  expect(fieldStyle(theme, { multiline: true }).minHeight).toBe(theme.touch * 2);
});
it('reserves both lines for a multiline iOS field and returns to its default minimum', () => {
  const theme = resolveTheme('light', {}, 'ios');
  expect(
    fieldStyle({ ...theme, fontScale: 3.571 }, { multiline: true }).minHeight,
  ).toBeGreaterThanOrEqual(22 * 3.571 * 2 + 18);
  expect(fieldStyle(theme, { multiline: true }).minHeight).toBe(theme.touch * 2);
});
