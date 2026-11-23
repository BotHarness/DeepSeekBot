// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { creationTargets } from '../src/host/creation-targets';

const fixture = vi.hoisted(() => ({ hostId: undefined as string | undefined, push: vi.fn() }));
vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null, Rect: () => null }));
vi.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  router: { push: fixture.push },
  useLocalSearchParams: () => ({ hostId: fixture.hostId }),
}));
vi.mock('../src/ui/shell/use-creation-targets', () => ({
  useCreationTargets: () => creationTargets({ hostId: 'mac', name: 'Mac' }, []),
}));
import { BotSourceScreen } from '../src/ui/shell/bot-source-screen';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
it.each([undefined, 'mac'])(
  'opens the four source routes from one page with host %s',
  async (hostId) => {
    fixture.hostId = hostId;
    fixture.push.mockClear();
    const host = document.createElement('div');
    const root = createRoot(host);
    try {
      await act(async () => root.render(<BotSourceScreen />));
      for (const [id, pathname] of [
        ['blank', '/create-bot'],
        ['marketplace', '/marketplace'],
        ['zip', '/import-bot-zip'],
        ['git', '/import-bot-git'],
      ]) {
        const row = host.querySelector<HTMLButtonElement>(`[data-testid="bot-source-${id}"]`)!;
        await act(async () => row.click());
        expect(fixture.push).toHaveBeenLastCalledWith({
          pathname,
          params: hostId ? { entry: 'host', hostId } : { entry: 'all' },
        });
      }
    } finally {
      act(() => root.unmount());
    }
  },
);
