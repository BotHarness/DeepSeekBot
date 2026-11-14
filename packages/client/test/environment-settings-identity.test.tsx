// @vitest-environment jsdom
import { act, createElement, type InputHTMLAttributes, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ModelSettingsClient } from '../../../apps/mobile/src/host/bot-settings.js';
import { DEFAULT_HOST_LOOK, type HostLook } from '../../../apps/mobile/src/ui/design/host-look.js';
import type { BridgeCall } from '../src/client/bridge.js';
import { mountLocalEnvironmentSettings } from '../src/client/environment-settings-source.js';

let identity: { id?: string; name?: string } = {};
let owner = 'a';
let holdCatalog = false;
let finishCatalog: (() => void) | undefined;
let look: HostLook = DEFAULT_HOST_LOOK;
const calls: { method: string; owner: string; args: Record<string, unknown> }[] = [];
const aliasWrites = vi.fn(async (_hostId: string, change: (value: HostLook) => HostLook) => {
  look = change(look);
});
const snapshot = { hosts: [], avatars: new Map(), tab: 'all' };
const catalog = (id: string) => ({
  models: [{ provider: 'provider', model: id, providerName: 'Provider', modelName: `Model ${id}` }],
  default: { provider: 'provider', model: id },
  defaultRevision: 0,
});
function modelClient(): ModelSettingsClient {
  return {
    async call(method, args = {}) {
      const current = owner;
      calls.push({ method, owner: current, args });
      if (method === 'modelCatalog') {
        if (holdCatalog) {
          holdCatalog = false;
          return new Promise((resolve) => {
            finishCatalog = () => resolve(catalog(current));
          });
        }
        return catalog(current);
      }
      if (method === 'modelPresets')
        return {
          presets: [
            {
              id: current,
              name: `Preset ${current}`,
              revision: 1,
              orchestrator: { provider: 'provider', model: current },
              assignmentDefault: { provider: 'provider', model: current },
            },
          ],
        };
      throw Error(`Unexpected method ${method}`);
    },
  };
}
let releaseSource: () => void;
function mountSource() {
  const client = modelClient();
  const call: BridgeCall = async (method, args) => ({
    ok: true,
    value: await client.call(method, args),
  });
  return mountLocalEnvironmentSettings(
    call,
    () => {},
    () => {},
  );
}
vi.mock('../src/client/this-host.js', () => ({ useThisHost: () => identity }));
vi.mock('../src/client/remote-hosts.js', () => ({
  THIS_HOST: 'local',
  remoteHosts: () => ({
    subscribe: () => () => {},
    getSnapshot: () => snapshot,
    client: () => undefined,
  }),
}));
vi.mock('../src/client/host-looks.js', () => ({
  useHostLook: () => look,
  useHostLookError: () => undefined,
  useHostInk: () => 'currentColor',
  hostLooks: () => ({ update: aliasWrites, refresh: async () => {} }),
}));
vi.mock('../src/client/bot-color-scheme.js', () => ({ useBotColorScheme: () => 'light' }));
vi.mock('../src/client/host-glyph.js', () => ({ HostGlyph: () => null }));
vi.mock('../src/client/channel-sidebar-icon.js', () => ({ ChannelSidebarIcon: () => null }));
vi.mock('../src/client/model-picker.js', () => ({ ModelPicker: () => null }));
vi.mock('../src/client/combobox.js', () => ({ Combobox: () => null }));
vi.mock('../src/client/remote-notification-settings.js', () => ({
  RemoteNotificationSettings: () => null,
}));
vi.mock('../src/client/overview-usage-view.js', () => ({ OverviewUsageView: () => null }));
vi.mock('../src/client/overview-memory-view.js', () => ({ OverviewMemoryView: () => null }));
vi.mock('../src/client/storage-settings.js', () => ({ StorageSettings: () => null }));
vi.mock('../src/client/remote-host-settings-source.js', () => ({
  remoteHostSettingsSource: () => ({}),
}));
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Input: (props: InputHTMLAttributes<HTMLInputElement>) => createElement('input', props),
  Checkbox: () => null,
  Button: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) =>
    createElement('button', { onClick }, children),
}));
vi.mock('../src/client/ds/select.js', () => ({
  Select: ({
    value,
    options,
    label,
    onChange,
  }: {
    value: string;
    options: readonly { value: string; label: ReactNode }[];
    label: string;
    onChange(value: string): void;
  }) =>
    createElement(
      'select',
      {
        value,
        'aria-label': label,
        onChange: (event: React.ChangeEvent<HTMLSelectElement>) =>
          onChange(event.currentTarget.value),
      },
      options.map((option) =>
        createElement('option', { key: option.value, value: option.value }, option.label),
      ),
    ),
}));
vi.mock('../src/client/ds/settings-dialog.js', () => ({
  SettingsDialog: ({
    title,
    caption,
    headerAction,
    sections,
    onSelect,
    children,
  }: {
    title: string;
    caption: ReactNode;
    headerAction: ReactNode;
    sections: readonly { id: string; label: string }[];
    onSelect(id: string): void;
    children: ReactNode;
  }) =>
    createElement(
      'section',
      { 'aria-label': title },
      caption,
      headerAction,
      sections.map((section) =>
        createElement(
          'button',
          { key: section.id, onClick: () => onSelect(section.id) },
          section.label,
        ),
      ),
      children,
    ),
}));
vi.mock('../src/client/ds/form-dialog.js', () => ({ FormDialog: () => null }));

import { HostSettings } from '../src/client/host-settings.js';
import { hostSettingsDrafts } from '../src/client/host-settings-drafts.js';
import { en } from '../src/client/locale.js';

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  identity = {};
  owner = 'a';
  holdCatalog = false;
  finishCatalog = undefined;
  look = DEFAULT_HOST_LOOK;
  calls.length = 0;
  aliasWrites.mockClear();
  releaseSource = mountSource();
});
afterEach(() => {
  releaseSource();
  vi.unstubAllGlobals();
});
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
async function edit(container: HTMLElement, value: string) {
  await act(() => {
    const input = container.querySelector('input');
    if (!input) throw Error('Editor input missing');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
function harness() {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  return {
    container,
    render: async () => {
      await act(async () => {
        root.render(
          createElement(HostSettings, {
            hostId: 'local',
            name: 'This Host',
            local: true,
            onClose: () => {},
            t: (key) => Object.entries(en).find(([name]) => name === key)?.[1] ?? key,
          }),
        );
        await flush();
      });
    },
    close: async () => {
      await act(() => root.unmount());
      container.remove();
    },
  };
}

it('retains a mounted model draft when the same local owner first reveals its canonical identity', async () => {
  const view = harness();
  try {
    await view.render();
    await edit(view.container, 'Keep this draft');
    expect(hostSettingsDrafts.hasDirty('local')).toBe(true);
    expect(view.container.querySelector('button[disabled]')?.textContent).toBeDefined();
    const save = [...view.container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Save as preset',
    );
    expect(save?.disabled).toBe(true);
    identity = { id: 'canonical-a', name: 'Host A' };
    await view.render();
    expect(view.container.querySelector('input')?.value).toBe('Keep this draft');
    expect(hostSettingsDrafts.hasDirty('local')).toBe(false);
    expect(hostSettingsDrafts.hasDirty('canonical-a')).toBe(true);
    identity = {};
    await view.render();
    expect(view.container.querySelector('input')?.value).toBe('Keep this draft');
    expect(hostSettingsDrafts.hasDirty('canonical-a')).toBe(true);
    expect(calls.filter((call) => call.method === 'modelPresetCreate')).toHaveLength(0);
  } finally {
    await view.close();
  }
});

it('does not expose a writable alias under the local sentinel and saves only the canonical Host key', async () => {
  const view = harness();
  try {
    await view.render();
    await act(async () => {
      [...view.container.querySelectorAll('button')]
        .find((button) => button.textContent === 'Appearance in this app')
        ?.click();
      await flush();
    });
    expect(view.container.querySelector('input')).toBeNull();
    expect(aliasWrites).not.toHaveBeenCalled();
    identity = { id: 'canonical-a', name: 'Host A' };
    await view.render();
    await edit(view.container, 'My local alias');
    identity = {};
    await view.render();
    const releasePrompt = hostSettingsDrafts.prompt('canonical-a', async () => 'save');
    try {
      await act(async () => {
        expect(await hostSettingsDrafts.prepare('canonical-a')).toBe(false);
      });
      expect(aliasWrites).not.toHaveBeenCalled();
      expect(view.container.querySelector('input')?.value).toBe('My local alias');
      expect(hostSettingsDrafts.hasDirty('canonical-a')).toBe(true);
    } finally {
      releasePrompt();
    }
    identity = { id: 'canonical-a', name: 'Host A' };
    await view.render();
    await act(async () => {
      [...view.container.querySelectorAll('button')]
        .find((button) => button.textContent === 'Save')
        ?.click();
      await flush();
    });
    expect(aliasWrites).toHaveBeenCalledTimes(1);
    expect(aliasWrites.mock.calls[0]?.[0]).toBe('canonical-a');
    expect(look.name).toBe('My local alias');
  } finally {
    await view.close();
  }
});

it('starts a new query owner for a real known Host change and ignores the retired owner read', async () => {
  identity = { id: 'canonical-a', name: 'Host A' };
  let view = harness();
  try {
    await view.render();
    await edit(view.container, 'Old owner draft');
    holdCatalog = true;
    await act(async () => {
      [...view.container.querySelectorAll('button')]
        .find((button) => button.textContent === 'Refresh model list')
        ?.click();
      await flush();
    });
    expect(finishCatalog).toBeDefined();
    owner = 'b';
    identity = { id: 'canonical-b', name: 'Host B' };
    await view.render();
    expect(calls.some((call) => call.method === 'modelCatalog' && call.owner === 'b')).toBe(true);
    expect(view.container.querySelector('input')?.value).toBe('');
    expect(view.container.textContent).toContain('Preset b');
    expect(view.container.textContent).not.toContain('Preset a');
    await view.close();
    view = harness();
    await view.render();
    expect(view.container.textContent).toContain('Preset b');
    expect(view.container.textContent).not.toContain('Preset a');
    await act(async () => {
      finishCatalog?.();
      await flush();
    });
    expect(view.container.textContent).toContain('Preset b');
    expect(view.container.textContent).not.toContain('Preset a');
    await edit(view.container, 'Retired access draft');
    releaseSource();
    releaseSource = mountSource();
    await view.render();
    expect(view.container.querySelector('input')?.value).toBe('');
    expect(calls.filter((call) => call.method === 'modelPresetCreate')).toHaveLength(0);
  } finally {
    finishCatalog?.();
    await view.close();
  }
});
