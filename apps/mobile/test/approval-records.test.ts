import { describe, expect, it } from 'vitest';

import {
  loadApprovalHistory,
  loadApprovalRules,
  revokeApprovalRule,
  type ApprovalRule,
} from '../src/host/approval-records';
import { createHostClient } from '../src/host/client';
import {
  historyDetail,
  inputSummary,
  outcomeLabel,
  ruleDetail,
  ruleTitle,
  toolGlyph,
} from '../src/ui/chat/approval-records-text';
import { t } from '../src/ui/strings';
import { FakeHost } from './fake-host';

const ROUTE = 'https://studio.tailnet-example.ts.net';
const slug = 'ada';

function client(fake: FakeHost) {
  return createHostClient({ routes: [ROUTE], credential: fake.credential, carrier: fake.carrier });
}

const decided = {
  decisionMessageId: 'd2',
  requestMessageId: 'r2',
  channelId: 'dm-ada',
  requestedAt: '2026-10-27T08:00:00.000Z',
  decidedAt: '2026-10-27T08:01:00.000Z',
  toolName: 'bash',
  role: 'orchestrator',
  cwd: '/Users/ada',
  input: '{"command":"git   status\\n--short"}',
  outcome: 'allowed-always-exact',
};

describe('approval history and always-allow rules on the phone', () => {
  it('pages approval history with the Host cursor and drops malformed entries', async () => {
    const fake = new FakeHost();
    fake.methods.set('toolApprovalHistory', (args) =>
      args['cursor'] === undefined
        ? { entries: [decided, { ...decided, outcome: 'maybe' }], nextCursor: 'next' }
        : {
            entries: [
              {
                ...decided,
                decisionMessageId: 'd1',
                outcome: 'rejected',
                actor: { platform: 'feishu' },
              },
            ],
          },
    );
    const host = client(fake);
    const first = await loadApprovalHistory(host, slug);
    expect(first.nextCursor).toBe('next');
    expect(first.entries).toEqual([
      {
        decisionMessageId: 'd2',
        requestMessageId: 'r2',
        channelId: 'dm-ada',
        decidedAt: '2026-10-27T08:01:00.000Z',
        toolName: 'bash',
        role: 'orchestrator',
        input: decided.input,
        outcome: 'allowed-always-exact',
        external: false,
      },
    ]);
    const second = await loadApprovalHistory(host, slug, 'next');
    expect(second.nextCursor).toBeUndefined();
    expect(second.entries[0]).toMatchObject({ outcome: 'rejected', external: true });
    expect(fake.calls.map((call) => [call.method, call.args])).toEqual([
      ['toolApprovalHistory', { slug }],
      ['toolApprovalHistory', { slug, cursor: 'next' }],
    ]);

    const now = Date.parse('2026-10-27T08:31:00.000Z');
    expect(historyDetail(first.entries[0]!, now)).toBe(
      `git status --short\n${t.approvals.allowedAlways} · ${t.ago(30)}`,
    );
    expect(historyDetail(second.entries[0]!, now)).toBe(
      `git status --short\n${t.approvals.denied} · ${t.approvals.viaIm} · ${t.ago(30)}`,
    );
  });

  it('lists active rules with their count, and revokes one', async () => {
    const fake = new FakeHost();
    const base = {
      botSlug: slug,
      role: 'assignment',
      scopeKey: 'grant-1',
      createdAt: '2026-10-20T00:00:00.000Z',
    };
    fake.methods.set('toolApprovalRules', () => ({
      rules: [
        {
          ...base,
          id: 'exact',
          kind: 'exact',
          toolName: 'bash',
          input: '{"command":"pnpm test"}',
          autoApprovedCount: 3,
        },
        { ...base, id: 'old', kind: 'tool', toolName: 'bash', input: '', revokedAt: 'x' },
        {
          ...base,
          id: 'legacy',
          role: 'orchestrator',
          kind: 'tool',
          toolName: 'web_fetch',
          input: '',
        },
      ],
    }));
    fake.methods.set('toolApprovalRuleRevoke', (args) => ({
      rule: { ...base, id: args['id'], revokedAt: '2026-10-27T00:00:00.000Z' },
    }));
    const host = client(fake);
    const rules = await loadApprovalRules(host, slug);
    expect(rules.map((rule) => rule.id)).toEqual(['exact', 'legacy']);
    expect(ruleDetail(rules[0]!)).toBe(
      `pnpm test\n${t.approvals.inAssignments} · ${t.approvals.autoApproved(3)}`,
    );
    expect(ruleDetail(rules[1]!)).toBe(`${t.approvals.anyInput}\n${t.approvals.inChat}`);
    await revokeApprovalRule(host, slug, 'exact');
    expect(fake.calls.at(-1)).toMatchObject({
      method: 'toolApprovalRuleRevoke',
      args: { slug, id: 'exact' },
    });
  });

  it('names rules, outcomes and tool icons', () => {
    const rule = (patch: Partial<ApprovalRule>): ApprovalRule => ({
      id: 'r',
      role: 'orchestrator',
      kind: 'exact',
      toolName: 'bash',
      input: '',
      createdAt: '',
      external: false,
      ...patch,
    });
    expect(ruleTitle(rule({ kind: 'all-opaque', toolName: '*' }))).toBe(t.approvals.allTools);
    expect(
      ruleDetail(
        rule({
          kind: 'secret-cli',
          toolName: 'secret_cli',
          input: '{"program":"gh","account":"work","env":["GH_TOKEN"]}',
          autoApprovedCount: 0,
        }),
      ),
    ).toBe(`gh · work\n${t.approvals.inChat} · ${t.approvals.autoApproved(0)}`);
    expect(outcomeLabel('allowed-once')).toBe(t.approvals.allowedOnce);
    expect(outcomeLabel('allowed-always-tool')).toBe(t.approvals.allowedAlways);
    expect(outcomeLabel('rejected')).toBe(t.approvals.denied);
    expect(inputSummary(JSON.stringify({ cwd: '/x', command: 'a'.repeat(200) }))).toHaveLength(120);
    expect(inputSummary(JSON.stringify({ x: 120, y: 400 }))).toBe('x: 120, y: 400');
    expect(inputSummary('plain text')).toBe('plain text');
    expect(toolGlyph('bash')).toBe('terminal');
    expect(toolGlyph('browser_navigate')).toBe('browser');
    expect(toolGlyph('computer_click')).toBe('computer');
    expect(toolGlyph('write_file')).toBe('file');
    expect(toolGlyph('web_fetch')).toBe('tool');
  });
});
