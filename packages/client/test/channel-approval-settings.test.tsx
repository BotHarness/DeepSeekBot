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

it('explains the legacy switch to a manager and saves a rule in channel mode', async () => {
  const onChange = await render(legacy, true);
  expect(host.textContent).toContain('这个频道还在用旧的审批方式');
  expect(host.textContent).toContain('发到 Bot 负责人的动态');
  expect(
    host.querySelector('[data-channel-approval-preview] [data-approval-masked]'),
  ).not.toBeNull();
  const decide = host.querySelector<HTMLButtonElement>(
    '[data-channel-approval-row="decideApprovals"] button',
  )!;
  expect(decide.textContent).toContain('只有 Bot 负责人和权限表里允许的角色');
  await act(async () => decide.click());
  await act(async () => menuItem('频道所有成员').click());
  expect(onChange).toHaveBeenCalledWith({
    ...legacy,
    approvalMode: 'channel',
    everyone: { ...legacy.everyone, decideApprovals: 'allow' },
  });
});

it('shows the current rules read-only to a member who cannot manage them', async () => {
  await render({ ...DEFAULT_POLICY, approvalMode: 'channel' }, false);
  expect(host.textContent).toContain('只有频道管理员能修改审批规则');
  expect(host.textContent).not.toContain('旧的审批方式');
  expect(host.querySelector('[data-channel-approval-row] button')).toBeNull();
  expect(host.querySelector('[data-channel-approval-row="seeApprovals"]')?.textContent).toContain(
    '频道所有成员',
  );
});
