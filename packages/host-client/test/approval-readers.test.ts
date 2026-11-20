import { describe, expect, it, vi } from 'vitest';
import {
  answerUserQuestion,
  decideToolApproval,
  overrideAutoRejection,
  readApprovalTemplates,
  readToolApprovalRules,
  readToolApprovalStatus,
  readUserQuestionStatus,
  revokeToolApprovalRule,
  setBotApprovalTemplate,
} from '../src/approval-readers';
import { HostAnswerInvalid } from '../src/host-answer';

const at = '2026-11-20T00:00:00Z';
const host = (value: unknown) => ({ call: vi.fn().mockResolvedValue(value) });
const template = {
  name: 'careful',
  title: 'Careful',
  description: 'Review changes',
  builtIn: true,
  usedBy: [],
  text: '# Careful',
};
const rule = {
  id: 'rule-1',
  botSlug: 'tea',
  role: 'orchestrator',
  scopeKey: 'host',
  kind: 'tool',
  toolName: 'reader',
  input: '',
  createdAt: at,
  autoApprovedCount: 0,
};
const actor = {
  platform: 'feishu',
  bindingId: 'binding',
  fingerprint: 'a'.repeat(64),
  actorId: 'actor',
  pairingId: 'pair',
  pairingRevision: 1,
  conversationId: 'conversation',
  messageId: 'message',
};
const card = {
  kind: 'tool-approval',
  masked: true,
  botSlug: 'tea',
  state: 'pending',
  requestedAt: at,
};

describe('Approval templates', () => {
  it('reads global templates without Bot selection and full inherited selection', async () => {
    const global = { templates: [template], globalDefault: null };
    await expect(readApprovalTemplates(host(global))).resolves.toEqual(global);
    const inherited = { ...global, selected: '@global', source: 'global', effective: null };
    await expect(readApprovalTemplates(host(inherited), 'tea')).resolves.toEqual(inherited);
  });

  it.each([
    { selected: false },
    { globalDefault: [] },
    { effective: 1 },
    { source: 'inherited' },
    { selected: '@global' },
    { templates: [{ ...template, builtIn: null }] },
    { templates: [{ ...template, text: 42 }] },
    { templates: [{ ...template, usedBy: [false] }] },
  ])('rejects a malformed template result %j', async (change) => {
    await expect(
      readApprovalTemplates(host({ templates: [template], ...change })),
    ).rejects.toBeInstanceOf(HostAnswerInvalid);
  });

  it('requires a Bot selection for a Bot and the correct Bot in a mutation receipt', async () => {
    await expect(readApprovalTemplates(host({ templates: [] }), 'tea')).rejects.toBeInstanceOf(
      HostAnswerInvalid,
    );
    const bot = {
      slug: 'tea',
      displayName: 'Tea',
      roles: [],
      aggregateState: 'idle',
      workspaces: [],
      createdAt: at,
      standingLimits: { soul: 1500, coreMemory: 2000 },
      sessions: {},
    };
    await expect(setBotApprovalTemplate(host({ bot }), 'tea', null)).resolves.toEqual({ bot });
    await expect(
      setBotApprovalTemplate(host({ bot: { ...bot, approvalTemplate: null } }), 'tea', null),
    ).rejects.toBeInstanceOf(HostAnswerInvalid);
    await expect(setBotApprovalTemplate(host({ bot }), 'other', null)).rejects.toBeInstanceOf(
      HostAnswerInvalid,
    );
  });
});

describe('Approval rules', () => {
  it('reads active rules and a revoked rule with its external creator', async () => {
    await expect(readToolApprovalRules(host({ rules: [rule] }), 'tea')).resolves.toEqual({
      rules: [rule],
    });
    const receipt = { rule: { ...rule, revokedAt: at, externalCreator: actor } };
    await expect(revokeToolApprovalRule(host(receipt), 'tea', rule.id)).resolves.toEqual(receipt);
  });

  it.each([
    { botSlug: 'other' },
    { scopeKey: null },
    { autoApprovedCount: -1 },
    { revokedAt: null },
    { externalCreator: { ...actor, pairingRevision: '1' } },
    { externalCreator: { ...actor, messageId: null } },
  ])('rejects a malformed rule %j', async (change) => {
    const malformed = { ...rule, ...change };
    await expect(readToolApprovalRules(host({ rules: [malformed] }), 'tea')).rejects.toBeInstanceOf(
      HostAnswerInvalid,
    );
    await expect(
      revokeToolApprovalRule(host({ rule: malformed }), 'tea', rule.id),
    ).rejects.toBeInstanceOf(HostAnswerInvalid);
  });

  it('rejects a receipt for another rule', async () => {
    await expect(revokeToolApprovalRule(host({ rule }), 'tea', 'other')).rejects.toBeInstanceOf(
      HostAnswerInvalid,
    );
  });
});

describe('Approval and question state', () => {
  it('reads minimal and enriched states', async () => {
    const pending = { status: 'pending' };
    const approval = { ...pending, expiresAt: at, execution: 'waiting-human', approval: card };
    const question = {
      status: 'answered',
      approval: {
        ...card,
        kind: 'user-question',
        masked: false,
        opaque: true,
        decidedBy: { humanId: 'owner' },
      },
    };
    for (const value of [pending, approval])
      await expect(readToolApprovalStatus(host(value), 'dm-tea', 'request')).resolves.toEqual(
        value,
      );
    for (const value of [pending, question])
      await expect(readUserQuestionStatus(host(value), 'dm-tea', 'request')).resolves.toEqual(
        value,
      );
  });

  it.each([
    { status: 'approved' },
    { status: 'pending', expiresAt: 'soon' },
    { status: 'expired', expiresAt: null },
    { status: 'pending', execution: 'other' },
    { status: 'pending', approval: { ...card, decidedAt: null } },
  ])('refuses a malformed approval status %j', async (value) => {
    await expect(readToolApprovalStatus(host(value), 'dm-tea', 'request')).rejects.toBeInstanceOf(
      HostAnswerInvalid,
    );
  });

  it.each([
    { status: true },
    { status: 'pending', approval: null },
    {
      status: 'answered',
      approval: {
        ...card,
        masked: false,
        opaque: true,
        decidedBy: { humanId: 'owner', displayName: 42 },
      },
    },
  ])('refuses a malformed question status %j', async (value) => {
    await expect(readUserQuestionStatus(host(value), 'dm-tea', 'request')).rejects.toBeInstanceOf(
      HostAnswerInvalid,
    );
  });
});

describe('Approval and question acknowledgements', () => {
  it.each([
    (value: unknown) => decideToolApproval(host(value), 'dm-tea', 'request', 'allowed-once'),
    (value: unknown) => answerUserQuestion(host(value), 'dm-tea', 'request', { answers: [] }),
  ])('requires explicit acceptance', async (submit) => {
    await expect(submit({ accepted: true })).resolves.toEqual({ accepted: true });
    for (const value of [{}, { accepted: false }, { accepted: 'true' }])
      await expect(submit(value)).rejects.toBeInstanceOf(HostAnswerInvalid);
  });

  it('validates the override receipt and its message reference', async () => {
    const receipt = { accepted: true, channelId: 'dm-tea', messageId: 'message' };
    await expect(overrideAutoRejection(host(receipt), 'autoreject:request')).resolves.toEqual(
      receipt,
    );
    for (const value of [
      { accepted: true },
      { ...receipt, messageId: null },
      { ...receipt, accepted: false },
    ])
      await expect(overrideAutoRejection(host(value), 'autoreject:request')).rejects.toBeInstanceOf(
        HostAnswerInvalid,
      );
  });
});
