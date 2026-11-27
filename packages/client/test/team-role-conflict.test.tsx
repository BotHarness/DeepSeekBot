// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { BridgeCall } from '../src/client/bridge.js';
import { zhTranslate } from '../src/client/locale.js';
import { RolesSection } from '../src/client/team-roles.js';
import type { TeamRole } from '../src/client/team-roles-bridge.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./primitive-mocks.js')).shellPrimitives(),
}));

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  document.body.innerHTML = '';
});

const leads: TeamRole = {
  roleId: 'leads',
  name: 'Leads',
  builtin: null,
  permissions: ['channels.create'],
  denied: [],
  models: { kind: 'all' },
  memberCount: 1,
  policy: [],
  policyRevision: 1,
  revision: 3,
};

function button(label: string): HTMLButtonElement {
  const match = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (node) => node.textContent === label,
  );
  if (!match) throw new Error(`Missing button ${label}`);
  return match;
}

it('sends the revision it edited and reloads the latest role after a stale save', async () => {
  const latest = { ...leads, name: 'Leads 2', revision: 4 };
  const onChanged = vi.fn();
  const call = vi.fn<BridgeCall>(async (method) => {
    if (method === 'roleUpdate')
      return { ok: false, error: { code: 'stale-role', message: 'stale', details: {} } };
    if (method === 'roles') return { ok: true, value: [latest] };
    throw new Error(method);
  });
  await act(async () =>
    root.render(
      <RolesSection
        call={call}
        t={zhTranslate}
        roles={[leads]}
        catalog={[{ id: 'channels.create', group: 'channels' }]}
        canEdit
        viewer={{ owner: true, permissions: [] }}
        onChanged={onChanged}
      />,
    ),
  );
  await act(async () => button('编辑').click());
  await act(async () => button('保存').click());
  expect(call).toHaveBeenCalledWith(
    'roleUpdate',
    expect.objectContaining({ roleId: 'leads', expectedRevision: 3 }),
    undefined,
  );
  const note = () => document.querySelector<HTMLElement>('[data-team-role-conflict]');
  expect(note()?.dataset['teamRoleConflict']).toBe('stale');
  expect(note()?.textContent).toContain('你的修改没有保存');
  await act(async () =>
    document.querySelector<HTMLButtonElement>('[data-team-role-reload]')!.click(),
  );
  expect(note()?.dataset['teamRoleConflict']).toBe('reloaded');
  expect(onChanged).toHaveBeenCalledTimes(1);
  expect(
    document.querySelector<HTMLInputElement>('input[type="text"], input:not([type])')?.value,
  ).toBe('Leads 2');
  await act(async () => button('保存').click());
  expect(call).toHaveBeenLastCalledWith(
    'roleUpdate',
    expect.objectContaining({ roleId: 'leads', expectedRevision: 4, name: 'Leads 2' }),
    undefined,
  );
});
