// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { BridgeCall } from '../src/client/bridge.js';
import { zhTranslate as t } from '../src/client/locale.js';
import {
  customTemplate,
  host,
  mountLibrary,
  openDeletion,
  templates,
  trigger,
  unmountLibrary,
} from './support/approval-template-library.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () =>
  (await import('./support/settings-dialog-primitives.js')).mockSettingsDialogPrimitives(),
);

vi.mock('../src/client/avatar.js', () => ({ PersonaBotAvatar: () => null }));

vi.mock('../src/client/channel-sidebar-icon.js', () => ({ ChannelSidebarIcon: () => null }));

beforeEach(mountLibrary);

afterEach(unmountLibrary);

const deletePreview = {
  name: 'night-shift',
  revision: 'a'.repeat(64),
  globalDefaultBefore: 'cautious',
  globalDefaultAfter: 'cautious',
  globalDefaultAvailable: true,
  hiddenBotCount: 0,
  affectedBots: [{ slug: 'ada', source: 'specific' }],
};

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
  const reload = [...document.querySelectorAll<HTMLElement>('button, [role="menuitem"]')].find(
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
    let absentPreviews = 0;
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
      if (endpoint === 'approvalTemplateDeletePreview') {
        if (deleted) {
          absentPreviews++;
          return {
            ok: false,
            error: { code: 'unknown-template', message: 'removed', details: {} },
          };
        }
        return { ok: true, value: { preview: deletePreview } };
      }
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
      const dialog = confirmDeletion().closest('[role="dialog"]');
      if (!dialog) throw new Error('Missing deletion dialog');
      const retry = [...dialog.querySelectorAll<HTMLButtonElement>('button')].find(
        (b) => b.textContent === t('autoApproval.reload'),
      );
      if (!retry) throw new Error('Missing read recovery');
      await act(async () => retry.click());
    }
    expect(host.querySelector('[data-approval-template="night-shift"]')).toBeNull();
    expect(trigger().textContent).toContain(t('autoApproval.off'));
    expect(document.body.textContent).not.toContain(
      t('autoApproval.library.deleteTitle', { title: 'Night shift' }),
    );
    expect(absentPreviews).toBe(1);
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
  const reload = [...document.querySelectorAll<HTMLElement>('button, [role="menuitem"]')].find(
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
