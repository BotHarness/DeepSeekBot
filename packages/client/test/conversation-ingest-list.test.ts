// @vitest-environment jsdom
import { act, createElement, type PropsWithChildren } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./primitive-mocks.js')).comboboxPrimitives(),
  ...(await import('./primitive-mocks.js')).dialogPrimitives(),
  Tag: ({ children }: PropsWithChildren) => createElement('span', null, children),
  Switch: ({
    checked,
    label,
    disabled,
    onChange,
  }: {
    checked: boolean;
    label: string;
    disabled?: boolean;
    onChange(value: boolean): void;
  }) =>
    createElement('button', {
      type: 'button',
      role: 'switch',
      'aria-checked': checked,
      'aria-label': label,
      disabled,
      onClick: () => onChange(!checked),
    }),
}));

import type {
  ConversationIngestRow,
  ConversationIngestSnapshot,
} from '../../core/src/messaging/conversation-ingest.js';
import { ConversationIngestRows } from '../src/client/conversation-ingest-list.js';
import { zhTranslate as t } from '../src/client/locale.js';
import {
  buttonNamed,
  chooseOption,
  comboboxOption,
  dialog,
  openCombobox,
} from './primitive-mocks.js';

const ROW: ConversationIngestRow = {
  id: 'ingest',
  channelId: 'group',
  providerId: 'dsh-im/feishu',
  accountRef: 'app',
  fingerprint: 'a'.repeat(64),
  platform: 'feishu',
  accountName: 'Support app',
  conversation: { kind: 'group', id: 'oc_team', name: 'Team room' },
  revision: 5,
  enabled: true,
  intakeAfter: '',
  wake: { mode: 'mentions', count: 10, intervalSeconds: 300 },
  createdAt: '',
  state: 'receiving',
};

const SNAPSHOT: ConversationIngestSnapshot = {
  channelId: 'group',
  ingests: [ROW],
  candidates: [
    {
      bindingId: 'binding',
      botSlug: 'ada',
      platform: 'feishu',
      accountName: 'Support app',
      conversations: [
        { kind: 'group', id: 'oc_team', name: 'Team room' },
        { kind: 'group', id: 'oc_new', name: 'New room' },
      ],
    },
  ],
};

let host: HTMLUListElement;
let root: Root;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('ul');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

async function render(channelIngest: (...args: unknown[]) => Promise<void>): Promise<void> {
  await act(async () =>
    root.render(
      createElement(ConversationIngestRows, {
        channelId: 'group',
        botNames: new Map([['ada', 'Ada']]),
        actions: { channelIngests: vi.fn(async () => SNAPSHOT), channelIngest } as never,
        t,
      }),
    ),
  );
}

async function click(button: HTMLButtonElement): Promise<void> {
  await act(async () => button.click());
}

it('adds a conversation only after an App and an unconnected conversation are chosen', async () => {
  const channelIngest = vi.fn(async () => undefined);
  await render(channelIngest);
  await click(
    host.querySelector<HTMLButtonElement>('[data-anchor="conversation-ingest-add"] button')!,
  );
  expect(dialog().getAttribute('aria-label')).toBe(t('ingest.addTitle'));
  expect(dialog().textContent).toContain(t('ingest.summary'));
  expect(buttonNamed(t('ingest.save'), dialog()).disabled).toBe(true);
  await chooseOption(t('ingest.app'), 'binding', dialog());
  await openCombobox(t('ingest.conversation'), dialog());
  expect(comboboxOption('oc_team')?.disabled).toBe(true);
  await click(comboboxOption('oc_new')!);
  await chooseOption(t('ingest.wake'), 'digest', dialog());
  await act(async () => dialog().querySelector('form')!.requestSubmit());
  expect(channelIngest).toHaveBeenCalledExactlyOnceWith('group', {
    kind: 'add',
    bindingId: 'binding',
    conversation: { kind: 'group', id: 'oc_new' },
    wake: { mode: 'digest', count: 10, intervalSeconds: 300 },
  });
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});

it('keeps the dialog open with the exists error and updates or deletes an existing ingest', async () => {
  const channelIngest = vi.fn(async (_channel: unknown, input: unknown) => {
    if ((input as { kind: string }).kind === 'update' && channelIngest.mock.calls.length === 1)
      throw Object.assign(new Error('exists'), { code: 'ingest-exists' });
  });
  await render(channelIngest as never);
  const edit = () =>
    click(
      host.querySelector<HTMLButtonElement>(
        `[title="${t('ingest.edit', { name: 'Team room' })}"]`,
      )!,
    );
  await edit();
  expect(dialog().getAttribute('aria-label')).toBe(t('ingest.edit', { name: 'Team room' }));
  await chooseOption(t('ingest.wake'), 'all', dialog());
  await click(buttonNamed(t('ingest.update'), dialog()));
  expect(dialog().querySelector('[role="alert"]')?.textContent).toBe(t('ingest.exists'));
  await click(buttonNamed(t('ingest.update'), dialog()));
  expect(channelIngest).toHaveBeenLastCalledWith('group', {
    kind: 'update',
    ingestId: 'ingest',
    expectedRevision: 5,
    wake: { mode: 'all', count: 1, intervalSeconds: 10 },
  });
  expect(document.querySelector('[role="dialog"]')).toBeNull();

  await edit();
  await click(buttonNamed(t('common.delete'), dialog()));
  expect(dialog().getAttribute('aria-label')).toBe(t('ingest.delete'));
  expect(dialog().textContent).toContain(t('ingest.deleteImpact'));
  await click(buttonNamed(t('ingest.confirmDelete'), dialog()));
  expect(channelIngest).toHaveBeenLastCalledWith('group', {
    kind: 'delete',
    ingestId: 'ingest',
    expectedRevision: 5,
  });
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});
