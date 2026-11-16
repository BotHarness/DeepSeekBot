// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ApprovalTemplateLibrarySettings } from '../src/client/approval-template-library.js';
import type { BridgeCall } from '../src/client/bridge.js';
import { zhTranslate as t } from '../src/client/locale.js';
import { createStore } from '../src/client/store.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./primitive-mocks.js')).dialogPrimitives(),
  ...(await import('./primitive-mocks.js')).comboboxPrimitives(),
  Tag: ({ children }: { children: ReactNode }) => createElement('span', null, children),
  Menu: ({
    items,
    onSelect,
  }: {
    items: { id: string; label: ReactNode }[];
    onSelect(id: string): void;
  }) =>
    createElement(
      'div',
      { role: 'menu' },
      items.map((item) =>
        createElement(
          'button',
          {
            key: item.id,
            role: 'menuitem',
            onClick: () => onSelect(item.id),
          },
          item.label,
        ),
      ),
    ),
}));
vi.mock('../src/client/avatar.js', () => ({ PersonaBotAvatar: () => null }));
vi.mock('../src/client/channel-sidebar-icon.js', () => ({ ChannelSidebarIcon: () => null }));

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});
const templates = ['cautious', 'get-work-done'].map((name) => ({
  name,
  title: name,
  description: '',
  builtIn: true,
  usedBy: [],
}));
function trigger(): HTMLButtonElement {
  const found = host.querySelector<HTMLButtonElement>(
    'button[aria-label="' + t('autoApproval.globalDefault') + '"]',
  );
  if (!found) throw new Error('Missing global selection');
  return found;
}
async function render(call: BridgeCall): Promise<void> {
  await act(async () =>
    root.render(createElement(ApprovalTemplateLibrarySettings, { call, store: createStore(), t })),
  );
}

it.each(['write', 'readback'])(
  'shows an unknown global selection after %s failure and retries reads without replaying the write',
  async (failure) => {
    let current = 'cautious';
    let reads = 0;
    let writes = 0;
    const call: BridgeCall = async (endpoint) => {
      if (endpoint === 'approvalTemplates') {
        reads++;
        if (failure === 'readback' && reads === 2) throw new Error('read failed');
        return { ok: true, value: { templates, globalDefault: current } };
      }
      if (endpoint === 'approvalTemplateGlobalSet') {
        writes++;
        if (failure === 'write') throw new Error('write response unavailable');
        current = 'get-work-done';
        return { ok: true, value: {} };
      }
      throw new Error('Unexpected endpoint ' + endpoint);
    };
    await render(call);
    await act(async () => trigger().click());
    const option = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(
      (button) => button.textContent === t('autoApproval.template.getWorkDone'),
    );
    if (!option) throw new Error('Missing template option');
    await act(async () => option.click());
    expect(writes).toBe(1);
    expect(trigger().textContent).toContain('读取失败');
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    const retry = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === t('autoApproval.reload'),
    );
    if (!retry) throw new Error('Missing read-only retry');
    await act(async () => retry.click());
    expect(writes).toBe(1);
    expect(trigger().textContent).toContain(
      t(
        failure === 'write'
          ? 'autoApproval.template.cautious'
          : 'autoApproval.template.getWorkDone',
      ),
    );
    expect(host.querySelector('[role="alert"]')).toBeNull();
  },
);

it('keeps a missing global template recognizable without silently clearing its name', async () => {
  const call: BridgeCall = async () => ({
    ok: true,
    value: { templates, globalDefault: 'night-shift' },
  });
  await render(call);
  expect(trigger().textContent).toContain('night-shift');
  expect(trigger().textContent).toContain('不可用');
});

it('keeps a custom template named off separate from the Off option', async () => {
  let selected: string | null = null;
  const writes: unknown[] = [];
  const call: BridgeCall = async (endpoint, args) => {
    if (endpoint === 'approvalTemplates')
      return {
        ok: true,
        value: {
          templates: [
            ...templates,
            { name: 'off', title: 'Off template', description: '', builtIn: false, usedBy: [] },
          ],
          globalDefault: selected,
        },
      };
    if (
      endpoint === 'approvalTemplateGlobalSet' &&
      args !== null &&
      typeof args === 'object' &&
      'template' in args &&
      (args.template === null || typeof args.template === 'string')
    ) {
      writes.push(args);
      selected = args.template;
      return { ok: true, value: {} };
    }
    throw new Error('Unexpected endpoint');
  };
  await render(call);
  await act(async () => trigger().click());
  const custom = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(
    (button) => button.textContent === 'Off template',
  );
  if (!custom) throw new Error('Missing custom off');
  await act(async () => custom.click());
  expect(writes).toEqual([{ template: 'off' }]);
  expect(trigger().textContent).toContain('Off template');
  await act(async () => trigger().click());
  const off = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(
    (button) => button.textContent === t('autoApproval.off'),
  );
  if (!off) throw new Error('Missing Off choice');
  await act(async () => off.click());
  expect(writes).toEqual([{ template: 'off' }, { template: null }]);
});
