// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { channelNavigationHarness } from './channel-navigation-harness';
import { afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  platform: 'ios',
  computerAvailable: true,
  connection: 'connected',
  bot: { slug: 'test', displayName: 'Test', computerAccess: false, browserAccess: false },
  actions: undefined as { onComputer?: () => void } | undefined,
  push: vi.fn(),
}));
vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return state.platform;
    },
  },
  View: 'div',
}));
vi.mock('expo-router', () => ({
  useNavigationContainerRef: () => channelNavigationHarness().navigation,
  useLocalSearchParams: () => ({ slug: 'test' }),
  useRouter: () => ({ push: state.push }),
}));
vi.mock('../src/host/host-session', () => ({
  useHostSession: () => ({ client: {}, saved: { hostId: 'qa' } }),
  useHostSnapshot: () => ({
    computerAvailable: state.computerAvailable,
    connection: { status: state.connection },
    roster: { bots: [state.bot] },
  }),
}));
vi.mock('../src/host/bot-profile', () => ({
  botChannels: () => [],
  botProfileResource: () => ({ peek: () => undefined, refresh: vi.fn() }),
}));
vi.mock('../src/ui/chat/bot-profile', () => ({
  BotProfileSheet: ({ actions }: { actions: { onComputer?: () => void } }) => {
    state.actions = actions;
    return null;
  },
}));
vi.mock('../src/ui/chat/bot-settings-panel', () => ({ BotSettingsPanel: () => null }));
vi.mock('../src/host/pick-avatar-image', () => ({ pickAvatarImage: vi.fn() }));
vi.mock('../src/ui/design/theme', () => ({
  useDesignTheme: () => ({ color: { surface: 'black' } }),
}));
vi.mock('../src/ui/primitives/text', () => ({ Text: 'span' }));
import BotProfileScreen from '../app/bot/[slug]/index';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
afterEach(async () => {
  if (root) await act(() => root!.unmount());
  root = undefined;
  state.actions = undefined;
  state.push.mockReset();
  state.bot.computerAccess = false;
  state.platform = 'ios';
  state.computerAvailable = true;
  state.connection = 'connected';
  document.body.replaceChildren();
});
async function render() {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(() => root!.render(createElement(BotProfileScreen)));
}
describe('Human Computer profile entry', () => {
  it.each(['refused', 'stopped'])(
    'hides remembered capability after device is %s',
    async (connection) => {
      state.connection = connection;
      await render();
      expect(state.actions?.onComputer).toBeUndefined();
    },
  );
  it.each(['ios', 'android'])(
    'hides unsupported Host on %s even with Bot tools enabled',
    async (platform) => {
      state.platform = platform;
      state.computerAvailable = false;
      state.bot.computerAccess = true;
      await render();
      expect(state.actions?.onComputer).toBeUndefined();
    },
  );
  it('opens the iOS Human viewer without changing the Bot tool opt-in', async () => {
    await render();
    expect(state.actions?.onComputer).toBeTypeOf('function');
    state.actions?.onComputer?.();
    expect(state.push).toHaveBeenCalledWith({
      pathname: '/computer/[slug]',
      params: { slug: 'test', hostId: 'qa' },
    });
    expect(state.bot.computerAccess).toBe(false);
  });
  it.each([false, true])(
    'opens the supported Host on Android regardless of Bot tool opt-in (%s)',
    async (enabled) => {
      state.platform = 'android';
      state.bot.computerAccess = enabled;
      await render();
      expect(state.actions?.onComputer !== undefined).toBe(true);
    },
  );
});
