// @vitest-environment jsdom
import { type Root } from 'react-dom/client';
import { type MessagingSnapshot } from '../../core/src/messaging/outbound.js';
import { type MessagingIdentityView } from '../../core/src/messaging/identity.js';
import { type ChannelSummary } from '../src/client/store.js';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./primitive-mocks.js')).shellPrimitives(),
  ...(await import('./primitive-mocks.js')).comboboxPrimitives(),
}));
vi.mock('../src/client/bot-settings-open.js', () => ({ openExternalBindingSettings: vi.fn() }));
import type { BridgeActions } from '../src/client/actions.js';
import { openExternalBindingSettings } from '../src/client/bot-settings-open.js';
import { zhTranslate } from '../src/client/locale.js';
import { OnboardingAppBinding } from '../src/client/onboarding-binding.js';
import { onboardingFor } from '../src/client/onboarding.js';
import { store } from '../src/client/store.js';
import { chooseOption, openCombobox, comboboxOption } from './primitive-mocks.js';

let container: HTMLDivElement;
let root: Root;
let sequence = 0;
let channel: ChannelSummary;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  channel = {
    id: `binding-dm-${++sequence}`,
    botSlug: `binding-bot-${sequence}`,
    type: 'dm',
    name: 'Binding Bot',
    members: [],
    createdAt: '',
    updatedAt: '',
  };
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  store.setRoster(
    [
      {
        slug: channel.botSlug!,
        displayName: channel.name,
        roles: [],
        aggregateState: 'idle',
        workspaces: [],
        createdAt: '',
      },
    ],
    [channel],
  );
  store.select({ kind: 'channel', channelId: channel.id });
  store.setConversation({ channel, sending: false });
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.mocked(openExternalBindingSettings).mockReset();
  sessionStorage.clear();
});
function fixture(completed = true) {
  let snapshot: MessagingSnapshot = { accounts: [], identities: [], grants: [], intents: [] };
  const actions = {
    onboarding: vi.fn().mockResolvedValue({
      profileId: `binding-profile-${sequence}`,
      tutorial: 'skipped',
      completed,
      preparation: 'ready',
      channelId: channel.id,
    }),
    load: vi.fn().mockResolvedValue(undefined),
    openChannel: vi.fn().mockResolvedValue(undefined),
    send: vi.fn(),
    messagingSnapshot: vi.fn(async () => snapshot),
    messagingIdentity: vi.fn(async () => undefined),
    messagingConversation: vi.fn(),
    messagingGroupPolicy: vi.fn(),
  };
  const bridge = actions as unknown as BridgeActions;
  const render = async () => {
    await act(async () => {
      await onboardingFor(bridge).enter();
      root.render(
        createElement(OnboardingAppBinding, {
          key: channel.id,
          actions: bridge,
          channelId: channel.id,
          t: zhTranslate,
        }),
      );
    });
  };
  return {
    actions,
    bridge,
    render,
    snapshot: (next: MessagingSnapshot) => {
      snapshot = next;
    },
  };
}
function button(label: string): HTMLButtonElement {
  const result = [
    ...(
      document.body.querySelector('[role="dialog"]') ?? container
    ).querySelectorAll<HTMLButtonElement>('button'),
  ].find((b) => (b.getAttribute('aria-label') ?? b.textContent?.trim()) === label);
  if (!result) throw new Error(`Missing button ${label}`);
  return result;
}
const click = async (label: string) => act(async () => button(label).click());
const account = (ref: string, platform = 'qq'): MessagingSnapshot['accounts'][number] => ({
  ref,
  platform,
  providerId: `provider-${platform}`,
  name: `${platform} ${ref}`,
  fingerprint: 'a'.repeat(64),
  connected: true,
});
function identity(
  reception: MessagingIdentityView['reception'] = 'receiving',
): MessagingIdentityView {
  return {
    id: 'binding-result',
    botSlug: channel.botSlug!,
    providerId: 'provider-qq',
    platform: 'qq',
    accountRef: 'available',
    name: 'qq available',
    fingerprint: 'a'.repeat(64),
    enabled: true,
    revision: 1,
    newConversations: 'auto',
    createdAt: '2026-10-08T00:00:00Z',
    availability: 'available',
    reception,
    grantCount: 0,
    scopes: [],
  };
}

describe('optional onboarding Bind app', () => {
  it('requires completion and the current active Human–Bot DM', async () => {
    const incomplete = fixture(false);
    await incomplete.render();
    expect(document.body.textContent).toBe('');
    const ready = fixture();
    await ready.render();
    expect(button('绑定应用')).toBeDefined();
    const noBot = { ...channel };
    delete noBot.botSlug;
    for (const next of [
      { ...channel, type: 'group' as const },
      { ...channel, id: 'other-dm' },
      noBot,
    ]) {
      await act(async () => store.setConversation({ channel: next }));
      expect(document.body.textContent).toBe('');
    }
    await act(async () => {
      store.setConversation({ channel });
      store.setRoster(
        [
          {
            slug: channel.botSlug!,
            displayName: 'Archived',
            roles: [],
            aggregateState: 'idle',
            workspaces: [],
            createdAt: '',
            paused: true,
          },
        ],
        [channel],
      );
    });
    expect(document.body.textContent).toBe('');
    expect(ready.actions.messagingSnapshot).not.toHaveBeenCalled();
  });

  it('opens only deliberately and dismisses quietly without changing completion or binding', async () => {
    const f = fixture();
    await f.render();
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    expect(f.actions.messagingSnapshot).not.toHaveBeenCalled();
    await click('绑定应用');
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
    expect(f.actions.messagingSnapshot).toHaveBeenCalledWith(channel.botSlug);
    await click('暂时不绑定');
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    await click('绑定应用');
    await click(zhTranslate('common.close'));
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    await f.render();
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    expect(onboardingFor(f.bridge).getSnapshot().receipt?.completed).toBe(true);
    expect(f.actions.messagingIdentity).not.toHaveBeenCalled();
    expect(f.actions.send).not.toHaveBeenCalled();
  });

  it('keeps empty apps, preparation tutorials and native settings truthful', async () => {
    const f = fixture();
    await f.render();
    await click('绑定应用');
    expect(button('绑定应用').disabled).toBe(true);
    expect(document.body.querySelectorAll('a[target="_blank"]').length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toContain(zhTranslate('identity.ready', { app: 'test' }));
    const cleanup = vi.fn();
    vi.mocked(openExternalBindingSettings).mockReturnValue(cleanup);
    await click(zhTranslate('identity.manageApps'));
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    const returned = vi.mocked(openExternalBindingSettings).mock.calls[0]![1];
    await act(async () => returned());
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
    expect(f.actions.messagingIdentity).not.toHaveBeenCalled();
    expect(onboardingFor(f.bridge).getSnapshot().receipt?.completed).toBe(true);
    await click('暂时不绑定');
    expect(cleanup).toHaveBeenCalled();
  });

  it('retains platform checks and explicitly binds a supported QQ account through the existing scoped action', async () => {
    const f = fixture();
    const accounts = [
      account('available'),
      account('lark', 'feishu'),
      { ...account('offline'), connected: false },
      { ...account('used'), boundBotSlug: 'other-bot' },
      { ...account('unsupported'), unsupported: 'checked-send' as const },
    ];
    f.snapshot({ accounts, identities: [], grants: [], intents: [] });
    await f.render();
    await click('绑定应用');
    expect(button('绑定应用').disabled).toBe(true);
    await openCombobox(zhTranslate('identity.app'), document.body);
    expect(comboboxOption('provider-qq:available')?.disabled).toBe(false);
    expect(comboboxOption('provider-feishu:lark')?.disabled).toBe(false);
    for (const ref of ['offline', 'used', 'unsupported'])
      expect(comboboxOption(`provider-qq:${ref}`)?.disabled).toBe(true);
    await act(async () => comboboxOption('provider-qq:available')!.click());
    expect(f.actions.messagingIdentity).not.toHaveBeenCalled();
    f.actions.messagingIdentity.mockImplementation(async () => {
      f.snapshot({ accounts, identities: [identity()], grants: [], intents: [] });
    });
    await click('绑定应用');
    expect(f.actions.messagingIdentity).toHaveBeenCalledExactlyOnceWith(channel.botSlug, {
      kind: 'bind',
      providerId: 'provider-qq',
      accountRef: 'available',
      fingerprint: 'a'.repeat(64),
    });
    expect(document.body.querySelector('[role="status"]')?.textContent).toBe(
      zhTranslate('identity.readyQq', { app: 'qq available' }),
    );
    await click(zhTranslate('identity.done'));
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    expect(f.actions.send).not.toHaveBeenCalled();
  });

  it.each(['connecting', 'unavailable'] as const)(
    'shows actual %s reception instead of ready',
    async (reception) => {
      const f = fixture();
      const accounts = [account('available')];
      f.snapshot({ accounts, identities: [], grants: [], intents: [] });
      await f.render();
      await click('绑定应用');
      await chooseOption(zhTranslate('identity.app'), 'provider-qq:available', document.body);
      f.actions.messagingIdentity.mockImplementation(async () => {
        f.snapshot({ accounts, identities: [identity(reception)], grants: [], intents: [] });
      });
      await click('绑定应用');
      expect(document.body.querySelector('[role="status"]')?.textContent).toBe(
        zhTranslate(reception === 'connecting' ? 'identity.connecting' : 'identity.offline', {
          app: 'qq available',
        }),
      );
    },
  );

  it('retains the selected app and an actionable error after a refused binding', async () => {
    const f = fixture();
    f.snapshot({ accounts: [account('available')], identities: [], grants: [], intents: [] });
    f.actions.messagingIdentity.mockRejectedValue(
      Object.assign(new Error('changed'), { code: 'identity-stale' }),
    );
    await f.render();
    await click('绑定应用');
    await chooseOption(zhTranslate('identity.app'), 'provider-qq:available', document.body);
    await click('绑定应用');
    expect(document.body.querySelector('[role="alert"]')?.textContent).toBe(
      zhTranslate('identity.stale'),
    );
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
    expect(button('绑定应用').disabled).toBe(false);
    expect(onboardingFor(f.bridge).getSnapshot().receipt?.completed).toBe(true);
  });

  it('reports failed app discovery and allows quiet dismissal', async () => {
    const f = fixture();
    f.actions.messagingSnapshot.mockRejectedValue(new Error('offline'));
    await f.render();
    await click('绑定应用');
    expect(document.body.querySelector('[role="alert"]')?.textContent).toBe(
      zhTranslate('identity.refreshFailed'),
    );
    expect(button('绑定应用').disabled).toBe(true);
    await click('暂时不绑定');
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    expect(f.actions.messagingIdentity).not.toHaveBeenCalled();
  });
});
