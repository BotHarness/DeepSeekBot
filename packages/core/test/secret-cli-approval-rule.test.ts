import { rmSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

import type { Agent } from '@deepseek-ai/dsh-agent';
import type { ToolExecution } from '@deepseek-ai/dsh-tools';

import type { ChannelMessage, ChannelRecord } from '../src/channels/channel.js';
import type { ChannelStore } from '../src/channels/store.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { defineSchemaPlan } from '../src/database/schema.js';
import type { SessionOwnership } from '../src/sessions/ownership.js';
import { ChannelToolApproval } from '../src/workspaces/tool-approval.js';
import {
  createToolApprovalRuleStore,
  secretCliKind,
  type ToolApprovalRuleStore,
} from '../src/workspaces/tool-approval-rules.js';
import { createTempRoot } from './helpers.js';

const botSlug = 'ada';
const sessionId = 'botharness-orchestrator-test';
const channelId = 'dm-ada';

const call = (overrides: Record<string, unknown> = {}) => ({
  account: 'github-work',
  references: ['private:00000000-0000-0000-0000-000000000000:token'],
  program: 'gh',
  args: ['repo', 'list'],
  env: [{ name: 'GH_TOKEN', value: '{{token}}' }],
  ...overrides,
});

async function withStore(
  test: (rules: ToolApprovalRuleStore, authorize: { ok: boolean }) => unknown,
) {
  const home = createTempRoot('bh-secret-cli-rule-');
  const owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
  const authorize = { ok: true };
  try {
    return await test(
      createToolApprovalRuleStore(
        attachOperationalModule(owner, 'tool-approval-rules'),
        () => authorize.ok,
      ),
      authorize,
    );
  } finally {
    owner.close();
    rmSync(home, { recursive: true, force: true });
  }
}

function broker(rules: ToolApprovalRuleStore) {
  const messages: ChannelMessage[] = [];
  const channel = { id: channelId, type: 'dm', botSlug } as ChannelRecord;
  const channels = {
    get: vi.fn((id: string) => (id === channelId ? channel : undefined)),
    getOrCreateDm: vi.fn(() => channel),
    appendMessage: vi.fn(async (id: string, message: ChannelMessage) => {
      if (id !== channelId) return undefined;
      messages.push(message);
      return message;
    }),
  } as unknown as ChannelStore;
  const ownership = {
    resolve: vi.fn((id: string) =>
      id === sessionId ? { sessionId, botSlug, rootRole: 'orchestrator' as const } : undefined,
    ),
  } as unknown as SessionOwnership;
  const agent = { session: { id: sessionId, header: { cwd: '/tmp/project' } } } as Agent;
  const approval = new ChannelToolApproval(channels, ownership, rules);
  let next = 0;
  const run = (args: Record<string, unknown>) => {
    const callId = 'call-' + ++next;
    approval.track(
      { agent, name: 'secret_cli', callId, arguments: args, token: Symbol(callId) } as never,
      'operation',
    );
    return {
      callId,
      answer: approval.ask({ agent, toolName: 'secret_cli', callId }),
    };
  };
  return { approval, messages, agent, run };
}

describe('secret_cli kind', () => {
  it('is the program, account and sorted variable names, never the arguments or values', () => {
    const a = secretCliKind(JSON.stringify(call()));
    expect(a).toBe('{"program":"gh","account":"github-work","env":["GH_TOKEN"]}');
    expect(secretCliKind(JSON.stringify(call({ args: ['auth', 'token'] })))).toBe(a);
    expect(
      secretCliKind(JSON.stringify(call({ env: [{ name: 'GH_TOKEN', value: 'x{{token}}' }] }))),
    ).toBe(a);
    const two = (names: string[]) =>
      secretCliKind(
        JSON.stringify(call({ env: names.map((name) => ({ name, value: '{{token}}' })) })),
      );
    expect(two(['B_TOKEN', 'A_TOKEN'])).toBe(two(['A_TOKEN', 'B_TOKEN']));
    expect(two(['A_TOKEN'])).not.toBe(two(['A_TOKEN', 'B_TOKEN']));
    expect(secretCliKind('{"program":"gh"}')).toBeUndefined();
    expect(secretCliKind('not json')).toBeUndefined();
  });
});

describe('secret_cli always-allow rule', () => {
  it('matches the same kind with other arguments and nothing else', () =>
    withStore((rules) => {
      const scope = { botSlug, role: 'orchestrator' as const, scopeKey: 'scope' };
      const rule = rules.createPending({
        ...scope,
        kind: 'secret-cli',
        toolName: 'secret_cli',
        input: secretCliKind(JSON.stringify(call()))!,
      });
      rules.activate(botSlug, rule.id);
      const match = (args: Record<string, unknown>, toolName = 'secret_cli') =>
        rules.match({ ...scope, toolName, input: JSON.stringify(args) })?.id;
      expect(match(call({ args: ['issue', 'list', '--limit', '5'] }))).toBe(rule.id);
      expect(match(call({ program: 'glab' }))).toBeUndefined();
      expect(match(call({ account: 'github-personal' }))).toBeUndefined();
      expect(
        match(
          call({
            env: [
              { name: 'GH_TOKEN', value: '{{token}}' },
              { name: 'GH_HOST', value: 'example.com' },
            ],
          }),
        ),
      ).toBeUndefined();
      expect(match(call(), 'bash')).toBeUndefined();
      expect(
        rules.match({
          ...scope,
          scopeKey: 'other',
          toolName: 'secret_cli',
          input: JSON.stringify(call()),
        }),
      ).toBeUndefined();
      expect(rules.list(botSlug)).toMatchObject([{ id: rule.id, kind: 'secret-cli' }]);
      rules.revoke(botSlug, rule.id);
      expect(match(call())).toBeUndefined();
    }));

  it('is never covered by an exact or all-opaque rule', () =>
    withStore((rules) => {
      const scope = { botSlug, role: 'orchestrator' as const, scopeKey: 'scope' };
      const input = JSON.stringify(call());
      for (const kind of ['exact', 'all-opaque'] as const) {
        const rule = rules.createPending({
          ...scope,
          kind,
          toolName: kind === 'exact' ? 'secret_cli' : '*',
          input: kind === 'exact' ? input : '',
        });
        rules.activate(botSlug, rule.id);
      }
      expect(rules.match({ ...scope, toolName: 'secret_cli', input })).toBeUndefined();
    }));

  it('stops matching when its external creator loses the pairing', () =>
    withStore((rules, authorize) => {
      const scope = { botSlug, role: 'orchestrator' as const, scopeKey: 'scope' };
      const rule = rules.createPending({
        ...scope,
        kind: 'secret-cli',
        toolName: 'secret_cli',
        input: secretCliKind(JSON.stringify(call()))!,
        externalCreator: {
          platform: 'feishu',
          bindingId: 'binding',
          fingerprint: 'a'.repeat(64),
          actorId: 'ou_alice',
          pairingId: 'pairing',
          pairingRevision: 1,
          conversationId: 'oc_private',
          messageId: 'om_card',
        },
      });
      rules.activate(botSlug, rule.id);
      const input = JSON.stringify(call({ args: ['api', 'user'] }));
      expect(rules.match({ ...scope, toolName: 'secret_cli', input })?.id).toBe(rule.id);
      authorize.ok = false;
      expect(rules.match({ ...scope, toolName: 'secret_cli', input })).toBeUndefined();
      expect(rules.list(botSlug)[0]?.revokedAt).toBeDefined();
    }));

  it('generation 95 keeps existing rules and their external creator', () => {
    const home = createTempRoot('bh-secret-cli-upgrade-');
    let owner = mountOperationalDatabase({
      dshHome: home,
      schemaPlan: defineSchemaPlan(
        BOT_HARNESS_SCHEMA_PLAN.migrations.filter((m) => m.generation <= 94),
      ),
    });
    try {
      attachOperationalModule(owner, 'tool-approval-rules').transaction((db) =>
        db
          .prepare(
            "INSERT INTO tool_approval_rules (id,bot_slug,role,scope_key,kind,tool_name,input,created_at,active,external_creator) VALUES ('legacy','ada','assignment','grant','exact','bash','{}','2026-10-11T00:00:00Z',1,NULL)",
          )
          .run(),
      );
      owner.close();
      owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
      const rules = createToolApprovalRuleStore(
        attachOperationalModule(owner, 'tool-approval-rules'),
      );
      expect(
        rules.match({
          botSlug: 'ada',
          role: 'assignment',
          scopeKey: 'grant',
          toolName: 'bash',
          input: '{}',
        })?.id,
      ).toBe('legacy');
    } finally {
      owner.close();
      rmSync(home, { recursive: true, force: true });
    }
  });
});

describe('secret_cli approval card', () => {
  it('always-allow lets the same kind run without a card until the rule is revoked', () =>
    withStore(async (rules) => {
      const state = broker(rules);
      const first = state.run(call());
      await vi.waitFor(() => expect(state.messages).toHaveLength(1));
      const card = state.messages[0]!;
      expect(card.toolApprovalRequest).toMatchObject({
        toolName: 'secret_cli',
        externalDecision: 'operation',
      });
      expect(await state.approval.decide(botSlug, card.id, 'allowed-always-all')).toBe(false);
      expect(await state.approval.decide(botSlug, card.id, 'allowed-always-exact')).toBe(true);
      expect(await first.answer).toBe('allowed-once');
      const [rule] = rules.list(botSlug);
      expect(rule).toMatchObject({
        kind: 'secret-cli',
        toolName: 'secret_cli',
        input: '{"program":"gh","account":"github-work","env":["GH_TOKEN"]}',
      });
      expect(rule!.input).not.toContain('{{token}}');

      const second = state.run(call({ args: ['issue', 'list'] }));
      expect(await second.answer).toBe('allowed-once');
      expect(state.approval.validAfterDecision(state.agent, second.callId)).toBe(true);
      expect(state.messages).toHaveLength(2);

      const other = state.run(call({ account: 'github-personal' }));
      await vi.waitFor(() => expect(state.messages).toHaveLength(3));
      expect(await state.approval.decide(botSlug, state.messages[2]!.id, 'rejected')).toBe(true);
      expect(await other.answer).toBe('rejected');

      rules.revoke(botSlug, rule!.id);
      const again = state.run(call({ args: ['issue', 'list'] }));
      await vi.waitFor(() => expect(state.messages).toHaveLength(5));
      expect(await state.approval.decide(botSlug, state.messages[4]!.id, 'allowed-once')).toBe(
        true,
      );
      expect(await again.answer).toBe('allowed-once');
      state.approval.close();
    }));

  it('lets a current external Approver save the kind through the exact-rule flow', () =>
    withStore(async (rules) => {
      const state = broker(rules);
      const first = state.run(call());
      await vi.waitFor(() => expect(state.messages).toHaveLength(1));
      const card = state.messages[0]!;
      const scope = state.approval.ruleScope(botSlug, card.id);
      expect(scope).toBeDefined();
      const actor = {
        platform: 'feishu' as const,
        bindingId: 'binding',
        fingerprint: 'a'.repeat(64),
        actorId: 'ou_alice',
        pairingId: 'pairing',
        pairingRevision: 1,
        conversationId: 'oc_private',
        messageId: 'om_card',
      };
      const saved = vi.fn();
      expect(
        await state.approval.decide(botSlug, card.id, 'allowed-always-exact', {
          actor,
          authorized: () => true,
          rule: { kind: 'exact', scopeKey: scope!.scopeKey, authorized: () => true },
          onRuleSaved: saved,
        }),
      ).toBe(true);
      expect(await first.answer).toBe('allowed-once');
      expect(saved).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'secret-cli', externalCreator: actor }),
      );
      state.approval.close();
    }));
});
