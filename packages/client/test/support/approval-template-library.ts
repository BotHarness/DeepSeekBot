import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { vi } from 'vitest';
import { ApprovalTemplateLibrarySettings } from '../../src/client/approval-template-library.js';
import type { BridgeCall } from '../../src/client/bridge.js';
import { type ApprovalTemplateView } from '../../src/client/features/approvals/bridge.js';
import { zhTranslate as t } from '../../src/client/locale.js';
import { createStore } from '../../src/client/store.js';

let root: Root;

export let host: HTMLDivElement;

export function mountLibrary(): void {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
}

export async function unmountLibrary(): Promise<void> {
  await act(async () => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
}

export const templates: ApprovalTemplateView[] = ['cautious', 'get-work-done'].map((name) => ({
  name,
  title: name,
  description: '',
  builtIn: true,
  usedBy: [],
  text: '# ' + name,
}));

export function trigger(): HTMLButtonElement {
  const found = host.querySelector<HTMLButtonElement>(
    'button[aria-label="' + t('autoApproval.globalDefault') + '"]',
  );
  if (!found) throw new Error('Missing global selection');
  return found;
}

export async function render(call: BridgeCall, store = createStore()): Promise<void> {
  await act(async () =>
    root.render(createElement(ApprovalTemplateLibrarySettings, { call, store, t })),
  );
}

export async function openDeletion(call: BridgeCall): Promise<void> {
  await render(call);
  const edit = host.querySelector<HTMLButtonElement>(
    '[data-approval-template="night-shift"] button',
  );
  if (!edit) throw new Error('Missing custom template');
  await act(async () => edit.click());
  const remove = [...document.querySelectorAll<HTMLElement>('button, [role="menuitem"]')].find(
    (button) => button.textContent === t('autoApproval.library.delete'),
  );
  if (!remove) throw new Error('Missing delete action');
  await act(async () => remove.click());
}

export const customTemplate: ApprovalTemplateView & { text: string } = {
  name: 'night-shift',
  title: 'Night shift',
  description: '',
  builtIn: false,
  usedBy: ['ada'],
  text: '# Night shift\n\nAsk before sending.\n',
};
