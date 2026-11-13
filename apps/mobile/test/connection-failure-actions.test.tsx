// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
const clipboard = vi.hoisted(() => vi.fn(async (_text: string) => {}));
vi.mock('expo-clipboard', () => ({ setStringAsync: clipboard }));
vi.mock('expo-application', () => ({
  nativeApplicationVersion: '1.7.0',
  nativeBuildVersion: '18',
}));
vi.mock('expo-device', () => ({ osVersion: '27.0' }));
vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('../src/ui/primitives/button', () => ({
  Button: (p: { testID: string; label: string; onPress(): void }) => (
    <button data-testid={p.testID} onClick={p.onPress}>
      {p.label}
    </button>
  ),
}));
vi.mock('../src/ui/primitives/text', () => ({
  Text: (p: { children: ReactNode }) => <span>{p.children}</span>,
}));
vi.mock('@expo/ui/swift-ui', () => ({
  Button: (p: { testID: string; label: string; onPress(): void }) => (
    <button data-testid={p.testID} onClick={p.onPress}>
      {p.label}
    </button>
  ),
  Text: (p: { children: ReactNode }) => <span>{p.children}</span>,
}));
vi.mock('@expo/ui/swift-ui/modifiers', () => ({ font: () => ({}) }));
import { ConnectionFailureActions as Android } from '../src/ui/primitives/connection-failure-actions';
import { ConnectionFailureActions as IOS } from '../src/ui/primitives/connection-failure-actions.ios';
import { connectionDiagnostic } from '../src/host/connection-diagnostic';
import { t } from '../src/ui/strings';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
let host: HTMLElement;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  clipboard.mockClear();
  clipboard.mockResolvedValue(undefined);
});
it.each([
  ['iOS', IOS],
  ['Android', Android],
] as const)(
  '%s expands, copies safe details and resets for another attempt',
  async (_platform, Component) => {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    const first = connectionDiagnostic({
      code: 'relay-unavailable',
      phase: 'pairing-offer',
      detail: 'relay:http-502',
      status: 502,
      occurredAt: '2026-11-13T15:00:00Z',
    });
    await act(async () => root!.render(<Component failure={first} id="hstudio" />));
    const button = (kind: string) =>
      host.querySelector<HTMLButtonElement>(`[data-testid="connection-${kind}-hstudio"]`)!;
    expect(host.textContent).not.toContain('stage:');
    await act(async () => button('details').click());
    expect(host.textContent).toContain('stage: pairing-offer');
    await act(async () => button('copy').click());
    expect(clipboard).toHaveBeenCalledWith(expect.stringContaining('http: 502'));
    expect(button('copy').textContent).toBe(t.connectionDiagnostic.copied);
    const next = connectionDiagnostic({
      code: 'host-offline',
      phase: 'pairing-offer',
      occurredAt: '2026-11-13T15:01:00Z',
    });
    await act(async () => root!.render(<Component failure={next} id="hstudio" />));
    expect(host.textContent).not.toContain('http: 502');
    expect(button('copy').textContent).toBe(t.connectionDiagnostic.copy);
    await act(async () => button('details').click());
    expect(host.textContent).toContain('reason: host-offline');
    clipboard.mockRejectedValueOnce(new Error('clipboard unavailable'));
    await act(async () => button('copy').click());
    expect(host.textContent).toContain(t.connectionDiagnostic.copyFailed);
  },
);
