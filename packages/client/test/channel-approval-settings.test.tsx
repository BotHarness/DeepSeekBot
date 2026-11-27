// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ChannelApprovalSettings } from '../src/client/channel-approval-settings.js';
import { zhTranslate } from '../src/client/locale.js';
import { DEFAULT_POLICY, type ChannelPolicy } from '../src/client/team-channels-bridge.js';

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

const legacy: ChannelPolicy = { ...DEFAULT_POLICY, approvalMode: 'legacy' };

async function render(policy: ChannelPolicy, manager: boolean, onChange = vi.fn()) {
  await act(async () =>
    root.render(
      <ChannelApprovalSettings
        t={zhTranslate}
        policy={policy}
        manager={manager}
        disabled={false}
        onChange={onChange}
      />,
    ),
  );
  return onChange;
}

function menuItem(label: string): HTMLElement {
  const item = [
    ...document.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemradio"]'),
  ].find((node) => node.textContent?.includes(label));
  if (!item) throw new Error(`Missing ${label}`);
  return item;
}

it('shows the original behavior on a legacy channel and switches only through the explicit action', async () => {
  const onChange = await render(legacy, true);
  expect(
    host.querySelector('[data-channel-approvals]')?.getAttribute('data-channel-approvals'),
  ).toBe('legacy');
  expect(host.textContent).toContain('这个频道沿用原来的审批方式');
  expect(host.querySelector('[data-channel-approval-row="seeApprovals"]')?.textContent).toContain(
    '只有能做决定的人',
  );
  expect(host.querySelector('[data-channel-approval-row] button')).toBeNull();
  const enable = host.querySelector<HTMLElement>('[data-channel-approval-enable]')!;
  expect(enable.textContent).toContain('启用后改按频道规则：频道所有成员能看到内容');
  await act(async () => enable.querySelector<HTMLButtonElement>('button')!.click());
  expect(onChange).toHaveBeenCalledWith({ ...legacy, approvalMode: 'channel' });
});

it('treats a policy without an approval mode as legacy', async () => {
  await render(DEFAULT_POLICY, true);
  expect(host.querySelector('[data-channel-approval-enable]')).not.toBeNull();
});

it('edits rules once a channel uses channel rules', async () => {
  const channel: ChannelPolicy = { ...DEFAULT_POLICY, approvalMode: 'channel' };
  const onChange = await render(channel, true);
  expect(host.querySelector('[data-channel-approval-enable]')).toBeNull();
  const decide = host.querySelector<HTMLButtonElement>(
    '[data-channel-approval-row="decideApprovals"] button',
  )!;
  await act(async () => decide.click());
  await act(async () => menuItem('频道所有成员').click());
  expect(onChange).toHaveBeenCalledWith({
    ...channel,
    everyone: { ...channel.everyone, decideApprovals: 'allow' },
  });
});

it('shows a member the legacy behavior read-only without the switch', async () => {
  await render(legacy, false);
  expect(host.textContent).toContain('只有频道管理员能修改审批规则');
  expect(host.querySelector('[data-channel-approval-enable]')).toBeNull();
});

it('shows the current rules read-only to a member who cannot manage them', async () => {
  await render({ ...DEFAULT_POLICY, approvalMode: 'channel' }, false);
  expect(host.textContent).toContain('只有频道管理员能修改审批规则');
  expect(host.querySelector('[data-channel-approval-row] button')).toBeNull();
  expect(host.querySelector('[data-channel-approval-row="seeApprovals"]')?.textContent).toContain(
    '频道所有成员',
  );
});
