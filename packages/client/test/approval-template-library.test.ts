// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ApprovalTemplateLibrarySettings } from '../src/client/approval-template-library.js';
import {
  decodeApprovalTemplateGuidance,
  encodeApprovalTemplateGuidance,
} from '../../core/src/workspaces/approval-template-guidance.js';
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
async function render(call: BridgeCall, store = createStore()): Promise<void> {
  await act(async () =>
    root.render(createElement(ApprovalTemplateLibrarySettings, { call, store, t })),
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

const customTemplate = {
  name: 'night-shift',
  title: 'Night shift',
  description: '',
  builtIn: false,
  usedBy: ['ada'],
  text: '# Night shift\n\nAsk before sending.\n',
};
const deletePreview = {
  name: 'night-shift',
  revision: 'a'.repeat(64),
  globalDefaultBefore: 'cautious',
  globalDefaultAfter: 'cautious',
  globalDefaultAvailable: true,
  hiddenBotCount: 0,
  affectedBots: [{ slug: 'ada', source: 'specific' }],
};
async function openDeletion(call: BridgeCall): Promise<void> {
  await render(call);
  const edit = host.querySelector<HTMLButtonElement>(
    '[data-approval-template="night-shift"] button',
  );
  if (!edit) throw new Error('Missing custom template');
  await act(async () => edit.click());
  const remove = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent === t('autoApproval.library.delete'),
  );
  if (!remove) throw new Error('Missing delete action');
  await act(async () => remove.click());
}
function confirmDeletion(): HTMLButtonElement {
  const button = document.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (!button) throw new Error('Missing confirmation');
  return button;
}

it('discloses global and direct references before enabling explicit deletion confirmation', async () => {
  const pending: {
    resolve?: (value: Awaited<ReturnType<BridgeCall>>) => void;
    promise?: Promise<Awaited<ReturnType<BridgeCall>>>;
  } = {};
  pending.promise = new Promise((resolve) => {
    pending.resolve = resolve;
  });
  const writes: Record<string, unknown>[] = [];
  let deleted = false;
  const call: BridgeCall = async (endpoint, payload) => {
    if (endpoint === 'approvalTemplates')
      return {
        ok: true,
        value: {
          templates: [...templates, ...(deleted ? [] : [customTemplate])],
          globalDefault: deleted ? null : 'night-shift',
        },
      };
    if (endpoint === 'approvalTemplateDeletePreview') {
      if (!pending.promise) throw new Error('Missing deferred read');
      return pending.promise;
    }
    if (endpoint === 'approvalTemplateDelete') {
      writes.push(payload);
      deleted = true;
      return { ok: true, value: { inheritedBots: ['ada'] } };
    }
    throw new Error('Unexpected endpoint ' + endpoint);
  };
  await openDeletion(call);
  expect(confirmDeletion().disabled).toBe(true);
  expect(writes).toEqual([]);
  const resolvePreview = pending.resolve;
  if (!resolvePreview) throw new Error('Missing preview resolver');
  await act(async () =>
    resolvePreview({
      ok: true,
      value: {
        preview: {
          ...deletePreview,
          globalDefaultBefore: 'night-shift',
          globalDefaultAfter: null,
          globalDefaultAvailable: false,
          affectedBots: [
            { slug: 'ada', source: 'specific' },
            { slug: 'bob', source: 'global' },
          ],
        },
      },
    }),
  );
  expect(document.body.textContent).toContain('ada');
  expect(document.body.textContent).toContain('bob');
  expect(document.body.textContent).toContain(t('autoApproval.library.deleteClearsGlobal'));
  expect(document.body.textContent).toContain(
    t('autoApproval.library.deleteEffective', { template: t('autoApproval.off') }),
  );
  expect(confirmDeletion().disabled).toBe(false);
  await act(async () => confirmDeletion().click());
  expect(writes).toEqual([{ name: 'night-shift', confirmed: true, revision: 'a'.repeat(64) }]);
  expect(host.querySelector('[data-approval-template="night-shift"]')).toBeNull();
});

it('refreshes changed impact and requires a second confirmation instead of replaying deletion', async () => {
  let previews = 0;
  const writes: Record<string, unknown>[] = [];
  const call: BridgeCall = async (endpoint, payload) => {
    if (endpoint === 'approvalTemplates')
      return {
        ok: true,
        value: { templates: [...templates, customTemplate], globalDefault: 'cautious' },
      };
    if (endpoint === 'approvalTemplateDeletePreview') {
      previews++;
      return {
        ok: true,
        value: {
          preview:
            previews === 1
              ? deletePreview
              : { ...deletePreview, revision: 'b'.repeat(64), globalDefaultAfter: 'get-work-done' },
        },
      };
    }
    if (endpoint === 'approvalTemplateDelete') {
      writes.push(payload);
      return writes.length === 1
        ? {
            ok: false,
            error: { code: 'approval-template-delete-changed', message: 'changed', details: {} },
          }
        : { ok: true, value: { inheritedBots: ['ada'] } };
    }
    throw new Error('Unexpected endpoint ' + endpoint);
  };
  await openDeletion(call);
  await act(async () => confirmDeletion().click());
  expect(writes).toHaveLength(1);
  expect(previews).toBe(2);
  expect(document.body.textContent).toContain(t('autoApproval.library.deleteChanged'));
  expect(document.body.textContent).toContain(t('autoApproval.template.getWorkDone'));
  await act(async () => confirmDeletion().click());
  expect(writes[1]).toEqual({ name: 'night-shift', confirmed: true, revision: 'b'.repeat(64) });
});

it('uses read-only recovery after an unconfirmed deletion result', async () => {
  let previews = 0;
  let writes = 0;
  const call: BridgeCall = async (endpoint) => {
    if (endpoint === 'approvalTemplates')
      return {
        ok: true,
        value: { templates: [...templates, customTemplate], globalDefault: 'cautious' },
      };
    if (endpoint === 'approvalTemplateDeletePreview') {
      previews++;
      return { ok: true, value: { preview: deletePreview } };
    }
    if (endpoint === 'approvalTemplateDelete') {
      writes++;
      throw new Error('Response unavailable');
    }
    throw new Error('Unexpected endpoint ' + endpoint);
  };
  await openDeletion(call);
  await act(async () => confirmDeletion().click());
  expect(writes).toBe(1);
  expect(confirmDeletion().disabled).toBe(true);
  expect(document.body.textContent).toContain(t('autoApproval.library.deleteUnconfirmed'));
  const reload = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent === t('autoApproval.reload'),
  );
  if (!reload) throw new Error('Missing read-only recovery');
  await act(async () => reload.click());
  expect(previews).toBe(2);
  expect(writes).toBe(1);
});

it.each(['invalid', 'wrong-target'])(
  'keeps confirmation disabled for %s preview data',
  async (kind) => {
    let writes = 0;
    const call: BridgeCall = async (endpoint) => {
      if (endpoint === 'approvalTemplates')
        return {
          ok: true,
          value: { templates: [...templates, customTemplate], globalDefault: 'cautious' },
        };
      if (endpoint === 'approvalTemplateDeletePreview')
        return {
          ok: true,
          value: { preview: kind === 'invalid' ? {} : { ...deletePreview, name: 'other' } },
        };
      writes++;
      throw new Error('Unexpected mutation');
    };
    await openDeletion(call);
    expect(confirmDeletion().disabled).toBe(true);
    expect(document.body.textContent).toContain(t('autoApproval.library.deletePreviewFailed'));
    expect(writes).toBe(0);
  },
);

it.each(['immediate', 'retry'] as const)(
  'converges canonical deletion after a lost response with %s readback',
  async (recovery) => {
    let deleted = false;
    let writes = 0;
    let reads = 0;
    const call: BridgeCall = async (endpoint) => {
      if (endpoint === 'approvalTemplates') {
        reads++;
        if (recovery === 'retry' && reads === 2) throw new Error('Read unavailable');
        return {
          ok: true,
          value: {
            templates: [...templates, ...(deleted ? [] : [customTemplate])],
            globalDefault: deleted ? null : 'night-shift',
          },
        };
      }
      if (endpoint === 'approvalTemplateDeletePreview')
        return deleted
          ? { ok: false, error: { code: 'unknown-template', message: 'removed', details: {} } }
          : { ok: true, value: { preview: deletePreview } };
      if (endpoint === 'approvalTemplateDelete') {
        writes++;
        deleted = true;
        throw new Error('Response lost after commit');
      }
      throw new Error('Unexpected ' + endpoint);
    };
    await openDeletion(call);
    await act(async () => confirmDeletion().click());
    expect(writes).toBe(1);
    if (recovery === 'retry') {
      expect(trigger().textContent).toContain('读取失败');
      const retry = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
        (b) => b.textContent === t('autoApproval.reload'),
      );
      if (!retry) throw new Error('Missing read recovery');
      await act(async () => retry.click());
    }
    expect(host.querySelector('[data-approval-template="night-shift"]')).toBeNull();
    expect(trigger().textContent).toContain(t('autoApproval.off'));
    expect(writes).toBe(1);
  },
);

it('reads canonical deletion after the confirmation dialog closes during the write', async () => {
  let deleted = false;
  let reads = 0;
  let writes = 0;
  let finish: ((value: Awaited<ReturnType<BridgeCall>>) => void) | undefined;
  const pending = new Promise<Awaited<ReturnType<BridgeCall>>>((resolve) => {
    finish = resolve;
  });
  const call: BridgeCall = async (endpoint) => {
    if (endpoint === 'approvalTemplates') {
      reads++;
      return {
        ok: true,
        value: {
          templates: [...templates, ...(deleted ? [] : [customTemplate])],
          globalDefault: deleted ? null : 'night-shift',
        },
      };
    }
    if (endpoint === 'approvalTemplateDeletePreview')
      return { ok: true, value: { preview: deletePreview } };
    if (endpoint === 'approvalTemplateDelete') {
      writes++;
      return pending;
    }
    throw new Error('Unexpected ' + endpoint);
  };
  await openDeletion(call);
  await act(async () => confirmDeletion().click());
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
  if (!dialog) throw new Error('Missing dialog');
  const dismiss = dialog.querySelector<HTMLButtonElement>(
    'button[aria-label="' + t('common.close') + '"]',
  );
  if (!dismiss) throw new Error('Missing close button');
  await act(async () => dismiss.click());
  expect(document.querySelector('[role="dialog"]')?.getAttribute('aria-label')).not.toContain(
    t('autoApproval.library.deleteTitle', { title: 'Night shift' }),
  );
  deleted = true;
  await act(async () => finish?.({ ok: true, value: { inheritedBots: ['ada'] } }));
  expect(reads).toBe(2);
  expect(writes).toBe(1);
  expect(host.querySelector('[data-approval-template="night-shift"]')).toBeNull();
  expect(trigger().textContent).toContain(t('autoApproval.off'));
});

async function clickText(label: string): Promise<void> {
  const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (item) => item.textContent === label,
  );
  if (!button) throw new Error('Missing button: ' + label);
  await act(async () => button.click());
}

it('requires an explicit source before showing the blank three-part editor and does not apply on opening', async () => {
  const calls: string[] = [];
  const call: BridgeCall = async (endpoint) => {
    calls.push(endpoint);
    return { ok: true, value: { templates, globalDefault: null } };
  };
  await render(call);
  await clickText(t('autoApproval.library.create'));
  expect(document.querySelector('textarea')).toBeNull();
  await clickText(t('autoApproval.library.chooseSource'));
  await clickText(t('autoApproval.library.blank'));
  expect(document.body.textContent).toContain(t('autoApproval.library.freeText'));
  expect(document.body.textContent).toContain(t('autoApproval.library.saveOnly'));
  expect(document.querySelector('textarea')?.value).toBe('');
  await clickText(
    t('autoApproval.library.addRow', { section: t('autoApproval.library.alwaysAsk') }),
  );
  expect(
    document.querySelector('input[aria-label="' + t('autoApproval.library.alwaysAsk') + ' 1"]'),
  ).not.toBeNull();
  expect(calls).toEqual(['approvalTemplates']);
});

it('starts an independent copy with save-only even after choosing apply for the shared original', async () => {
  const store = createStore();
  store.setRoster(
    [
      {
        slug: 'qa',
        displayName: 'QA',
        roles: [],
        aggregateState: 'idle',
        workspaces: [],
        createdAt: '2026-11-16',
      },
    ],
    [],
  );
  store.select({ kind: 'bot', slug: 'qa' });
  const calls: string[] = [];
  const call: BridgeCall = async (endpoint) => {
    calls.push(endpoint);
    return {
      ok: true,
      value: {
        templates: [
          {
            name: 'legacy',
            title: 'Legacy',
            description: '',
            builtIn: false,
            usedBy: ['qa'],
            text: '# Legacy\r\nKeep this.',
          },
        ],
        globalDefault: null,
      },
    };
  };
  await render(call, store);
  const button = host.querySelector<HTMLButtonElement>('[data-approval-template="legacy"] button');
  if (!button) throw new Error('Missing shared original');
  await act(async () => button.click());
  const choice = () =>
    document.querySelector<HTMLButtonElement>(
      'button[aria-label="' + t('autoApproval.library.saveChoice') + '"]',
    );
  await act(async () => choice()?.click());
  await clickText(t('autoApproval.library.saveApply', { name: 'QA' }));
  expect(choice()?.textContent).toContain('QA');
  await clickText(t('autoApproval.library.copy'));
  expect(choice()?.textContent).toContain(t('autoApproval.library.saveOnly'));
  expect(document.querySelector('textarea')?.value).toBe(
    '# Legacy\r\nKeep this.'.replaceAll('\r\n', '\n'),
  );
  expect(calls).toEqual(['approvalTemplates']);
});

it('identifies the selected source when independent templates have the same heading', async () => {
  const call: BridgeCall = async () => ({
    ok: true,
    value: {
      globalDefault: null,
      templates: ['alpha', 'beta'].map((name) => ({
        name,
        title: 'Shared heading',
        description: '',
        builtIn: false,
        usedBy: [],
        text: '# ' + name,
      })),
    },
  });
  await render(call);
  await clickText(t('autoApproval.library.create'));
  await clickText(t('autoApproval.library.chooseSource'));
  await clickText('Shared heading · beta');
  expect(document.querySelector('textarea')?.value).toBe('# beta');
});

it('keeps the visible View action in accessible template names', async () => {
  await render(async () => ({ ok: true, value: { templates, globalDefault: null } }));
  const buttons = [...host.querySelectorAll<HTMLButtonElement>('[data-approval-template] button')];
  expect(buttons).toHaveLength(2);
  for (const button of buttons) {
    expect(button.textContent).toBe(t('autoApproval.library.view'));
    expect(button.getAttribute('aria-label')).toContain(button.textContent);
  }
});

it('edits and removes independent guidance cards without changing neighbouring rules or applying', async () => {
  let template = {
    name: 'qa-rules',
    title: 'QA rules',
    description: '',
    builtIn: false,
    usedBy: [],
    text: encodeApprovalTemplateGuidance({
      alwaysAsk: ['Ask A', 'Ask B', 'Ask C'],
      alwaysAllow: ['Allow A', 'Allow B'],
      freeText: 'Keep free text unchanged.',
    }),
  };
  const calls: string[] = [];
  const call: BridgeCall = async (endpoint, payload) => {
    calls.push(endpoint);
    if (endpoint === 'approvalTemplates')
      return { ok: true, value: { templates: [template], globalDefault: null } };
    if (endpoint === 'approvalTemplateUpdate') {
      if (typeof payload.text !== 'string') throw new Error('Missing saved guidance');
      template = { ...template, text: payload.text };
      return { ok: true, value: { template } };
    }
    throw new Error('Unexpected endpoint ' + endpoint);
  };
  const ask = t('autoApproval.library.alwaysAsk');
  const allow = t('autoApproval.library.alwaysAllow');
  const input = (label: string): HTMLInputElement => {
    const found = document.querySelector<HTMLInputElement>('input[aria-label="' + label + '"]');
    if (!found) throw new Error('Missing rule ' + label);
    return found;
  };
  const fill = async (label: string, value: string): Promise<void> => {
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        input(label),
        value,
      );
      input(label).dispatchEvent(new Event('input', { bubbles: true }));
    });
  };
  const remove = async (label: string): Promise<void> => {
    const found = document.querySelector<HTMLButtonElement>(
      'button[aria-label="' + t('autoApproval.library.removeRow') + ' · ' + label + '"]',
    );
    if (!found) throw new Error('Missing remove action ' + label);
    await act(async () => found.click());
  };
  await render(call);
  const edit = host.querySelector<HTMLButtonElement>('[data-approval-template="qa-rules"] button');
  if (!edit) throw new Error('Missing template');
  await act(async () => edit.click());
  await fill(ask + ' 2', 'Ask B edited');
  await remove(ask + ' 1');
  expect(input(ask + ' 1').value).toBe('Ask B edited');
  expect(input(ask + ' 2').value).toBe('Ask C');
  expect(input(allow + ' 1').value).toBe('Allow A');
  await clickText(t('autoApproval.library.addRow', { section: ask }));
  await fill(ask + ' 3', 'Ask D');
  await remove(ask + ' 2');
  await fill(allow + ' 2', 'Allow B edited');
  expect(document.querySelector('textarea')?.value).toBe('Keep free text unchanged.');
  await clickText(t('autoApproval.library.save'));
  expect(decodeApprovalTemplateGuidance(template.text)).toEqual({
    alwaysAsk: ['Ask B edited', 'Ask D'],
    alwaysAllow: ['Allow A', 'Allow B edited'],
    freeText: 'Keep free text unchanged.',
  });
  expect(calls).toEqual(['approvalTemplates', 'approvalTemplateUpdate', 'approvalTemplates']);
});

it('resaves the visible original text after save succeeds but applying fails', async () => {
  const originalText = encodeApprovalTemplateGuidance({
    alwaysAsk: [],
    alwaysAllow: [],
    freeText: 'Original guidance',
  });
  let template = {
    name: 'retry-qa',
    title: 'Retry QA',
    description: '',
    builtIn: false,
    usedBy: [],
    text: originalText,
  };
  const store = createStore();
  store.setRoster(
    [
      {
        slug: 'qa',
        displayName: 'QA',
        roles: [],
        aggregateState: 'idle',
        workspaces: [],
        createdAt: '2026-11-16',
      },
    ],
    [],
  );
  store.select({ kind: 'bot', slug: 'qa' });
  const updates: string[] = [];
  const applied: string[] = [];
  let attempts = 0;
  const call: BridgeCall = async (endpoint, payload) => {
    if (endpoint === 'approvalTemplates')
      return { ok: true, value: { templates: [template], globalDefault: null } };
    if (endpoint === 'approvalTemplateUpdate') {
      if (typeof payload.text !== 'string') throw new Error('Missing saved text');
      updates.push(payload.text);
      template = { ...template, text: payload.text };
      return { ok: true, value: { template } };
    }
    if (endpoint === 'botApprovalTemplateSet') {
      if (++attempts === 1) throw new Error('apply failed');
      applied.push(template.text);
      return { ok: true, value: { bot: { slug: 'qa' } } };
    }
    throw new Error('Unexpected endpoint ' + endpoint);
  };
  const fillText = async (value: string): Promise<void> => {
    const field = document.querySelector('textarea');
    if (!field) throw new Error('Missing free text field');
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    if (!setter) throw new Error('Missing textarea value setter');
    await act(async () => {
      setter.call(field, value);
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };
  await render(call, store);
  const edit = host.querySelector<HTMLButtonElement>('[data-approval-template="retry-qa"] button');
  if (!edit) throw new Error('Missing retry template');
  await act(async () => edit.click());
  await clickText(t('autoApproval.library.saveOnly'));
  await clickText(t('autoApproval.library.saveApply', { name: 'QA' }));
  await fillText('Changed guidance');
  await clickText(t('autoApproval.library.save'));
  expect(document.body.textContent).toContain('apply failed');
  expect(decodeApprovalTemplateGuidance(template.text).freeText).toBe('Changed guidance');
  await fillText('Original guidance');
  await clickText(t('autoApproval.library.save'));
  expect(updates).toHaveLength(2);
  expect(applied).toEqual([originalText]);
  expect(template.text).toBe(originalText);
  expect(document.querySelector('textarea')).toBeNull();
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

it('warns when deletion targets unreadable content and still requires explicit confirmation', async () => {
  const writes: unknown[] = [];
  const call: BridgeCall = async (endpoint, payload) => {
    if (endpoint === 'approvalTemplates')
      return {
        ok: true,
        value: {
          templates: [...templates, customTemplate],
          globalDefault: 'cautious',
        },
      };
    if (endpoint === 'approvalTemplateDeletePreview')
      return { ok: true, value: { preview: { ...deletePreview, contentUnavailable: true } } };
    if (endpoint === 'approvalTemplateDelete') {
      writes.push(payload);
      return { ok: true, value: {} };
    }
    throw new Error('Unexpected endpoint ' + endpoint);
  };
  await openDeletion(call);
  expect(document.body.textContent).toContain(t('autoApproval.library.deleteContentUnavailable'));
  expect(writes).toEqual([]);
  expect(confirmDeletion().disabled).toBe(false);
  await act(async () => confirmDeletion().click());
  expect(writes).toHaveLength(1);
});

it.each([
  { creation: false, readFails: false },
  { creation: false, readFails: true },
  { creation: true, readFails: false },
  { creation: true, readFails: true },
])(
  'reopens persisted guidance after partial save (create=$creation, reload fails=$readFails)',
  async ({ creation, readFails }) => {
    const record = (freeText: string) => ({
      name: 'reopen-qa',
      title: 'Reopen QA',
      description: '',
      builtIn: false,
      usedBy: [],
      text: encodeApprovalTemplateGuidance({ alwaysAsk: [], alwaysAllow: [], freeText }),
    });
    let saved: ReturnType<typeof record> | undefined = creation
      ? undefined
      : record('Original guidance');
    let reads = 0,
      updates = 0,
      creates = 0,
      selections = 0;
    const applied: string[] = [];
    const store = createStore();
    store.setRoster(
      [
        {
          slug: 'qa',
          displayName: 'QA',
          roles: [],
          aggregateState: 'idle',
          workspaces: [],
          createdAt: '2026-11-16',
        },
      ],
      [],
    );
    store.select({ kind: 'bot', slug: 'qa' });
    const call: BridgeCall = async (endpoint, payload) => {
      if (endpoint === 'approvalTemplates') {
        reads++;
        if (readFails && reads === 2) throw new Error('Read unavailable');
        return {
          ok: true,
          value: {
            templates: [...templates, ...(saved === undefined ? [] : [saved])],
            globalDefault: null,
          },
        };
      }
      if (endpoint === 'approvalTemplateCreate' || endpoint === 'approvalTemplateUpdate') {
        if (typeof payload.text !== 'string') throw new Error('Missing text');
        if (endpoint === 'approvalTemplateCreate') creates++;
        else updates++;
        saved = { ...record(''), text: payload.text };
        return { ok: true, value: { template: saved } };
      }
      if (endpoint === 'botApprovalTemplateSet') {
        selections++;
        if (selections === 1) throw new Error('Apply unavailable');
        if (saved === undefined) throw new Error('Missing persisted template');
        applied.push(saved.text);
        return { ok: true, value: { bot: { slug: 'qa' } } };
      }
      throw new Error('Unexpected endpoint ' + endpoint);
    };
    const fill = async (field: HTMLInputElement | HTMLTextAreaElement, value: string) => {
      const prototype =
        field instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
      if (!setter) throw new Error('Missing field setter');
      await act(async () => {
        setter.call(field, value);
        field.dispatchEvent(new Event('input', { bubbles: true }));
      });
    };
    const edit = async () => {
      const button = host.querySelector<HTMLButtonElement>(
        '[data-approval-template="reopen-qa"] button',
      );
      if (!button) throw new Error('Missing current library row');
      await act(async () => button.click());
    };
    const chooseApply = async () => {
      const button = document.querySelector<HTMLButtonElement>(
        'button[aria-label="' + t('autoApproval.library.saveChoice') + '"]',
      );
      if (!button) throw new Error('Missing save choice');
      await act(async () => button.click());
      await clickText(t('autoApproval.library.saveApply', { name: 'QA' }));
    };
    await render(call, store);
    if (creation) {
      await clickText(t('autoApproval.library.create'));
      await clickText(t('autoApproval.library.chooseSource'));
      await clickText(t('autoApproval.library.blank'));
      const name = document.querySelector<HTMLInputElement>('input');
      if (!name) throw new Error('Missing template name');
      await fill(name, 'reopen-qa');
    } else await edit();
    const text = document.querySelector('textarea');
    if (!text) throw new Error('Missing guidance');
    await fill(text, 'Changed guidance');
    await chooseApply();
    await clickText(
      t(creation ? 'autoApproval.library.createSubmit' : 'autoApproval.library.save'),
    );
    expect(document.body.textContent).toContain('Apply unavailable');
    expect(selections).toBe(1);
    expect(
      saved === undefined ? undefined : decodeApprovalTemplateGuidance(saved.text).freeText,
    ).toBe('Changed guidance');
    await clickText(t('common.cancel'));
    if (readFails) {
      expect(host.querySelector('[data-approval-template="reopen-qa"]')).toBeNull();
      expect(document.body.textContent).toContain('Read unavailable');
      await clickText(t('autoApproval.reload'));
      expect(selections).toBe(1);
    }
    await edit();
    expect(document.querySelector('textarea')?.value).toBe('Changed guidance');
    await chooseApply();
    await clickText(t('autoApproval.library.save'));
    expect(applied).toEqual([record('Changed guidance').text]);
    expect(creates).toBe(creation ? 1 : 0);
    expect(updates).toBe(creation ? 0 : 1);
    expect(selections).toBe(2);
  },
);

it('retains an unreadable template deletion failure when the readable list omits its file', async () => {
  let omitted = false;
  let writes = 0;
  let previews = 0;
  const call: BridgeCall = async (endpoint) => {
    if (endpoint === 'approvalTemplates')
      return {
        ok: true,
        value: {
          templates: [...templates, ...(omitted ? [] : [customTemplate])],
          globalDefault: 'cautious',
        },
      };
    if (endpoint === 'approvalTemplateDeletePreview') {
      previews++;
      return { ok: true, value: { preview: { ...deletePreview, contentUnavailable: omitted } } };
    }
    if (endpoint === 'approvalTemplateDelete') {
      writes++;
      omitted = true;
      return {
        ok: false,
        error: {
          code: 'approval-template-delete-unavailable',
          message: 'File still exists',
          details: {},
        },
      };
    }
    throw new Error('Unexpected ' + endpoint);
  };
  await openDeletion(call);
  await act(async () => confirmDeletion().click());
  expect(document.body.textContent).toContain(t('autoApproval.library.deleteUnconfirmed'));
  expect(confirmDeletion().disabled).toBe(true);
  expect(previews).toBe(2);
  const reload = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent === t('autoApproval.reload'),
  );
  if (!reload) throw new Error('Missing recovery');
  await act(async () => reload.click());
  expect(document.body.textContent).toContain(t('autoApproval.library.deleteContentUnavailable'));
  expect(confirmDeletion().disabled).toBe(false);
  expect(previews).toBe(3);
  expect(writes).toBe(1);
});

it.each([false, true])(
  'refreshes canonical state after a concurrent deletion (read fails: %s)',
  async (readFails) => {
    let reads = 0;
    let writes = 0;
    const call: BridgeCall = async (endpoint) => {
      if (endpoint === 'approvalTemplates') {
        reads++;
        if (readFails && reads === 2) throw new Error('Canonical read failed');
        return {
          ok: true,
          value: {
            templates: [...templates, ...(reads === 1 ? [customTemplate] : [])],
            globalDefault: reads === 1 ? 'night-shift' : null,
          },
        };
      }
      if (endpoint === 'approvalTemplateDeletePreview')
        return {
          ok: false,
          error: { code: 'unknown-template', message: 'Removed by another client', details: {} },
        };
      writes++;
      throw new Error('No mutation expected');
    };
    await openDeletion(call);
    if (readFails) {
      expect(document.body.textContent).toContain(t('autoApproval.library.deletePreviewFailed'));
      expect(confirmDeletion().disabled).toBe(true);
      const dialog = confirmDeletion().closest('[role="dialog"]');
      if (!dialog) throw new Error('Missing deletion dialog');
      const reload = [...dialog.querySelectorAll<HTMLButtonElement>('button')].find(
        (button) => button.textContent === t('autoApproval.reload'),
      );
      if (!reload) throw new Error('Missing read-only retry');
      await act(async () => reload.click());
    }
    expect(host.querySelector('[data-approval-template="night-shift"]')).toBeNull();
    expect(trigger().textContent).toContain(t('autoApproval.off'));
    expect(document.body.textContent).not.toContain(
      t('autoApproval.library.deleteTitle', { title: 'Night shift' }),
    );
    expect(writes).toBe(0);
  },
);

it.each([false, true])(
  'keeps the latest library, global choice and editor after an older read finishes (fails: %s)',
  async (olderFails) => {
    const pending: ((value: Awaited<ReturnType<BridgeCall>>) => void)[] = [];
    const latestTemplate = {
      ...customTemplate,
      name: 'dawn-shift',
      title: 'Dawn shift',
      text: 'Latest guidance',
    };
    let reads = 0;
    let writes = 0;
    const call: BridgeCall = async (endpoint) => {
      if (endpoint === 'approvalTemplates') {
        if (++reads === 1)
          return {
            ok: true,
            value: { templates: [...templates, customTemplate], globalDefault: 'night-shift' },
          };
        return new Promise((resolve) => pending.push(resolve));
      }
      if (endpoint === 'approvalTemplateDeletePreview')
        return {
          ok: false,
          error: { code: 'unknown-template', message: 'Removed by another client', details: {} },
        };
      if (endpoint === 'approvalTemplateGlobalSet') {
        writes++;
        return { ok: true, value: {} };
      }
      throw new Error('Unexpected ' + endpoint);
    };
    await openDeletion(call);
    expect(pending).toHaveLength(1);
    await clickText(t('common.cancel'));
    await clickText(t('common.cancel'));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await act(async () => trigger().click());
    await clickText(t('autoApproval.template.getWorkDone'));
    expect(pending).toHaveLength(2);
    const later = pending[1];
    const earlier = pending[0];
    if (!later || !earlier) throw new Error('Missing concurrent reads');
    await act(async () =>
      later({
        ok: true,
        value: { templates: [...templates, latestTemplate], globalDefault: 'get-work-done' },
      }),
    );
    const edit = host.querySelector<HTMLButtonElement>(
      '[data-approval-template="dawn-shift"] button',
    );
    if (!edit) throw new Error('Missing latest template');
    await act(async () => edit.click());
    expect(document.querySelector('textarea')?.value).toBe('Latest guidance');
    await act(async () =>
      earlier(
        olderFails
          ? { ok: false, error: { code: 'read-failed', message: 'Older read failed', details: {} } }
          : { ok: true, value: { templates, globalDefault: null } },
      ),
    );
    expect(host.querySelector('[data-approval-template="dawn-shift"]')).not.toBeNull();
    expect(trigger().textContent).toContain(t('autoApproval.template.getWorkDone'));
    expect(document.querySelector('textarea')?.value).toBe('Latest guidance');
    expect(document.body.textContent).not.toContain('Older read failed');
    expect(writes).toBe(1);
  },
);
