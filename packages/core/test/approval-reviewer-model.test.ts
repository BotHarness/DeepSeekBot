import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Agent } from '@deepseek-ai/dsh-agent';
import type { ToolExecution } from '@deepseek-ai/dsh-tools';

import { runApprovalReviewerCommand } from '../src/bots/cli-approval-reviewer.js';
import { createBridgeMethods, type BridgeMethodsDeps } from '../src/bridge/methods.js';
import type { ChannelMessage, ChannelRecord } from '../src/channels/channel.js';
import type { ChannelStore } from '../src/channels/store.js';
import type { ModelRoute } from '../src/models/presets.js';
import type { SessionOwnership } from '../src/sessions/ownership.js';
import { createApprovalReviewRunner } from '../src/workspaces/approval-reviewer.js';
import {
  APPROVAL_REVIEWER_SETTINGS_FILE,
  createApprovalReviewerSettings,
  type ApprovalReviewerSettings,
} from '../src/workspaces/approval-reviewer-settings.js';
import { approvalTemplate, changesApprovalPolicy } from '../src/workspaces/approval-templates.js';
import { requiresHumanToolApproval } from '../src/workspaces/grant-execution.js';
import { ChannelToolApproval } from '../src/workspaces/tool-approval.js';

const botSlug = 'ada';
const sessionId = 'botharness-orchestrator-test';
const channelId = 'dm-ada';
const botRoute: ModelRoute = { provider: 'deepseek', model: 'bot-own-model' };
const known = new Set(['deepseek/bot-own-model', 'deepseek/fast-reviewer']);

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function profileDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'reviewer-model-'));
  dirs.push(dir);
  return dir;
}

async function validate(route: ModelRoute): Promise<void> {
  if (!known.has(route.provider + '/' + route.model))
    throw new Error(`Model ${route.provider}/${route.model} is unavailable`);
}

function gate(settings: ApprovalReviewerSettings) {
  const messages: ChannelMessage[] = [];
  const channel = { id: channelId, type: 'dm', botSlug } as ChannelRecord;
  const channels = {
    get: vi.fn((id: string) => (id === channelId ? channel : undefined)),
    getOrCreateDm: vi.fn(() => channel),
    appendMessage: vi.fn(async (_id: string, message: ChannelMessage) => {
      messages.push(message);
      return message;
    }),
  } as unknown as ChannelStore;
  const ownership = {
    resolve: vi.fn(() => ({ sessionId, botSlug, rootRole: 'orchestrator' as const })),
  } as unknown as SessionOwnership;
  const agent = {
    session: { id: sessionId, header: { cwd: '/tmp/project' }, snapshotEvents: () => [] },
  } as unknown as Agent;
  const streamed: Record<string, unknown>[] = [];
  const llm = {
    async *stream(options: Record<string, unknown>) {
      streamed.push(options);
      yield { type: 'text-delta', text: '{"outcome":"allow","reason":"Planning is allowed."}' };
      yield { type: 'finish', reason: { kind: 'stop' } };
    },
  };
  let reviewSessions = 0;
  const log = vi.fn();
  const broker = new ChannelToolApproval(
    channels,
    ownership,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    {
      template: () => {
        const found = approvalTemplate('get-work-done')!;
        return { name: found.name, text: found.text };
      },
      review: createApprovalReviewRunner({
        setting: () => settings.model(),
        botRoute: () => botRoute,
        validate,
        llm: () => llm,
        sessionId: () => `review-${++reviewSessions}`,
      }),
      log,
    },
  );
  const ask = async () => {
    broker.track({
      agent,
      name: 'todo_write',
      callId: 'call-1',
      arguments: { todos: [] },
      token: Symbol('call'),
    } as ToolExecution);
    return broker.ask({ agent, toolName: 'todo_write', callId: 'call-1' });
  };
  return { broker, messages, streamed, log, ask };
}

describe('Profile-wide reviewer model setting', () => {
  it('follows each Bot until a model is set, and reads back what was written', () => {
    const dir = profileDir();
    const settings = createApprovalReviewerSettings(dir);
    expect(settings.model()).toEqual({ kind: 'bot' });
    settings.setModel({ provider: 'deepseek', model: 'fast-reviewer', reasoningEffort: 'low' });
    expect(settings.model()).toEqual({
      kind: 'model',
      route: { provider: 'deepseek', model: 'fast-reviewer', reasoningEffort: 'low' },
    });
    settings.setModel(undefined);
    expect(settings.model()).toEqual({ kind: 'bot' });
    writeFileSync(join(dir, APPROVAL_REVIEWER_SETTINGS_FILE), '{"model":{"provider":1}}');
    expect(settings.model()).toEqual({ kind: 'invalid' });
    writeFileSync(join(dir, APPROVAL_REVIEWER_SETTINGS_FILE), 'not json');
    expect(settings.model()).toEqual({ kind: 'invalid' });
  });

  it('runs the reviewer on the set model, and on the Bot model again after `bot`', async () => {
    const settings = createApprovalReviewerSettings(profileDir());
    settings.setModel({ provider: 'deepseek', model: 'fast-reviewer' });
    const first = gate(settings);
    expect(await first.ask()).toBe('allowed-once');
    expect(first.streamed[0]).toMatchObject({
      provider: 'deepseek',
      model: 'fast-reviewer',
      sessionId: 'review-1',
    });
    expect(first.log).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'allow',
        model: 'deepseek/fast-reviewer',
        reviewSession: 'review-1',
      }),
    );

    settings.setModel(undefined);
    const second = gate(settings);
    expect(await second.ask()).toBe('allowed-once');
    expect(second.streamed[0]).toMatchObject({ provider: 'deepseek', model: 'bot-own-model' });
    expect(second.log).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'deepseek/bot-own-model' }),
    );
  });

  it('posts the card and logs why when the set model is unavailable, never using another model', async () => {
    const settings = createApprovalReviewerSettings(profileDir());
    settings.setModel({ provider: 'deepseek', model: 'no-such-model' });
    const state = gate(settings);
    const answer = state.ask();
    await vi.waitFor(() => expect(state.messages).toHaveLength(1));
    expect(state.messages[0]!.toolApprovalRequest?.toolName).toBe('todo_write');
    expect(state.streamed).toHaveLength(0);
    expect(state.log).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'ask-human',
        fallback: 'model-unavailable',
        model: 'deepseek/no-such-model',
        detail: 'Model deepseek/no-such-model is unavailable',
      }),
    );
    expect(await state.broker.decide(botSlug, state.messages[0]!.id, 'allowed-once')).toBe(true);
    expect(await answer).toBe('allowed-once');
  });

  it('posts the card when the setting cannot be read', async () => {
    const dir = profileDir();
    writeFileSync(join(dir, APPROVAL_REVIEWER_SETTINGS_FILE), 'not json');
    const state = gate(createApprovalReviewerSettings(dir));
    void state.ask();
    await vi.waitFor(() => expect(state.messages).toHaveLength(1));
    expect(state.messages[0]!.toolApprovalRequest).toBeDefined();
    expect(state.streamed).toHaveLength(0);
    expect(state.log).toHaveBeenCalledWith(
      expect.objectContaining({ fallback: 'settings-invalid' }),
    );
  });

  it('treats a Bot changing the reviewer model as a policy change, but not reading it', () => {
    expect(changesApprovalPolicy('deepseekbot approval-reviewer-model-set deepseek/x')).toBe(true);
    expect(changesApprovalPolicy('deepseekbot approval-reviewer-model-set bot')).toBe(true);
    expect(changesApprovalPolicy('{"method":"approvalReviewerModelSet"}')).toBe(true);
    expect(changesApprovalPolicy('echo {} > ~/.dsh/botharness/approval-reviewer.json')).toBe(true);
    expect(changesApprovalPolicy('deepseekbot approval-reviewer-model')).toBe(false);
    expect(
      requiresHumanToolApproval('bash', {
        command: 'deepseekbot approval-reviewer-model-set deepseek/x',
      }),
    ).toBe(true);
    expect(
      requiresHumanToolApproval('bash', { command: 'deepseekbot approval-reviewer-model' }),
    ).toBe(false);
  });
});

describe('approvalReviewerModel bridge methods', () => {
  const methods = (settings: ApprovalReviewerSettings) =>
    createBridgeMethods({
      approvalReviewer: settings,
      modelCatalog: { list: async () => [], validate },
    } as unknown as BridgeMethodsDeps);

  it('shows, sets, reports availability and clears the reviewer model', async () => {
    const settings = createApprovalReviewerSettings(profileDir());
    const bridge = methods(settings);
    expect(await bridge.approvalReviewerModel({})).toEqual({
      ok: true,
      value: { follows: 'bot', model: null },
    });
    expect(
      await bridge.approvalReviewerModelSet({
        model: { provider: 'deepseek', model: 'fast-reviewer' },
      }),
    ).toEqual({
      ok: true,
      value: {
        follows: 'model',
        model: { provider: 'deepseek', model: 'fast-reviewer' },
        available: true,
      },
    });
    expect(
      await bridge.approvalReviewerModelSet({ model: { provider: 'deepseek', model: 'gone' } }),
    ).toMatchObject({
      ok: true,
      value: {
        follows: 'model',
        available: false,
        unavailableReason: 'Model deepseek/gone is unavailable',
      },
    });
    expect(settings.model()).toEqual({
      kind: 'model',
      route: { provider: 'deepseek', model: 'gone' },
    });
    expect(await bridge.approvalReviewerModelSet({ model: null })).toEqual({
      ok: true,
      value: { follows: 'bot', model: null },
    });
    expect(await bridge.approvalReviewerModelSet({ model: 'deepseek' })).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    });
  });
});

describe('approval-reviewer-model CLI', () => {
  const rpc = () => {
    const calls: [string, Record<string, unknown>][] = [];
    return {
      calls,
      connect: async () => async (method: string, payload: Record<string, unknown>) => {
        calls.push([method, payload]);
        return { follows: 'bot', model: null };
      },
    };
  };

  it('reads and writes the setting through the bridge', async () => {
    const host = rpc();
    await runApprovalReviewerCommand('approval-reviewer-model', [], {}, host.connect);
    await runApprovalReviewerCommand(
      'approval-reviewer-model-set',
      ['deepseek/fast-reviewer'],
      { effort: 'low' },
      host.connect,
    );
    await runApprovalReviewerCommand(
      'approval-reviewer-model-set',
      ['openrouter/deepseek/some-model'],
      {},
      host.connect,
    );
    await runApprovalReviewerCommand('approval-reviewer-model-set', ['bot'], {}, host.connect);
    expect(host.calls).toEqual([
      ['approvalReviewerModel', {}],
      [
        'approvalReviewerModelSet',
        { model: { provider: 'deepseek', model: 'fast-reviewer', reasoningEffort: 'low' } },
      ],
      [
        'approvalReviewerModelSet',
        { model: { provider: 'openrouter', model: 'deepseek/some-model' } },
      ],
      ['approvalReviewerModelSet', { model: null }],
    ]);
  });

  it('refuses malformed arguments before connecting', async () => {
    const host = rpc();
    for (const [command, rest, values] of [
      ['approval-reviewer-model', ['x'], {}],
      ['approval-reviewer-model-set', [], {}],
      ['approval-reviewer-model-set', ['fast-reviewer'], {}],
      ['approval-reviewer-model-set', ['deepseek/'], {}],
      ['approval-reviewer-model-set', ['bot'], { effort: 'low' }],
    ] as const)
      await expect(
        runApprovalReviewerCommand(command, [...rest], values, host.connect),
      ).rejects.toMatchObject({ code: 'usage' });
    expect(host.calls).toEqual([]);
  });
});
