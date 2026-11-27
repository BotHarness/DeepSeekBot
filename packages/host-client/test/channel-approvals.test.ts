import { describe, expect, it, vi } from 'vitest';
import { readChannelApprovalRules, setChannelApprovalRule } from '../src/channel-approvals';

const channel = { id: 'g1', type: 'group', name: 'Ops', members: [] };

function host(answer: Record<string, unknown>) {
  return { call: vi.fn(async (method: string) => (method === 'channelGet' ? answer : {})) };
}

describe('channel approval rules', () => {
  it('reads the approval rules, mode and manager role from the channel answer', async () => {
    const client = host({
      channel,
      role: 'admin',
      policyRevision: 'abc',
      policy: {
        version: 1,
        approvalMode: 'legacy',
        everyone: { seeApprovals: 'deny' },
        overrides: [],
      },
    });
    await expect(readChannelApprovalRules(client, 'g1')).resolves.toMatchObject({
      manager: true,
      mode: 'legacy',
      see: 'deny',
      decide: 'deny',
      revision: 'abc',
    });
  });

  it('keeps a member read-only and writes one rule with the stored policy and revision', async () => {
    const client = host({
      channel,
      role: 'member',
      policyRevision: 'rev',
      policy: {
        version: 1,
        everyone: { post: 'allow' },
        overrides: [{ roleId: 'r', actions: {} }],
      },
    });
    const rules = await readChannelApprovalRules(client, 'g1');
    expect(rules?.manager).toBe(false);
    expect(rules?.see).toBe('allow');
    await setChannelApprovalRule(client, 'g1', rules!, 'decideApprovals', 'allow');
    expect(client.call).toHaveBeenLastCalledWith('channelPolicySet', {
      channelId: 'g1',
      expectedRevision: 'rev',
      policy: {
        version: 1,
        approvalMode: 'channel',
        everyone: { post: 'allow', decideApprovals: 'allow' },
        overrides: [{ roleId: 'r', actions: {} }],
      },
    });
  });

  it('returns nothing when the channel answer has no role or policy', async () => {
    await expect(readChannelApprovalRules(host({ channel }), 'g1')).resolves.toBeUndefined();
  });
});
