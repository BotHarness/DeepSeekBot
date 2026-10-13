import { createTestRegistry } from './registry-fixture.js';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, it } from 'vitest';

import { createChannelStore } from '../src/channels/store.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createMemoryService } from '../src/memory/service.js';
import { ensureMemoryRepository } from '../src/memory/repository.js';
import {
  createBotRuntime,
  type AssignmentAgentRun,
  type BotAgentAdapter,
  type BotRuntime,
} from '../src/runtime/bot-runtime.js';
import { createSessionOwnership } from '../src/sessions/ownership.js';
import { createTempRoot, FIXED_NOW } from './helpers.js';
import { createTestWorkspaceGrants, TEST_GRANT_ID } from './workspace-grant-fixture.js';

function git(root: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

async function admit(runtime: BotRuntime, channelId: string, messageId: string, body: string) {
  const admission = runtime.admitDmMessage({ channelId, messageId, body });
  if (!admission.admitted) throw new Error(admission.reason);
  await admission.settled;
}

it('coordinates a dirty Memory switch with an addressed Assignment and retries in the same Session', async () => {
  const home = createTempRoot('botharness-memory-coordinate-');
  const registry = createTestRegistry({
    rootDir: join(home, 'bots'),
    initializeMemory(memoryDir) {
      const result = ensureMemoryRepository({ memoryDir });
      return result.ok ? { ok: true } : { ok: false, message: result.message };
    },
  });
  expect(registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
  const memoryRoot = registry.memoryDirFor('ada')!;
  const channels = createChannelStore({ rootDir: join(home, 'channels'), now: FIXED_NOW });
  const dm = channels.getOrCreateDm('ada', 'Ada')!;
  const owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
  const ownership = createSessionOwnership(attachOperationalModule(owner, 'session-ownership'));
  const memory = createMemoryService({ registry, ownership, database: owner, now: FIXED_NOW });
  const seed = memory.snapshot('ada').head!;
  const persona = memory.saveHuman({
    botSlug: 'ada',
    path: 'PERSONA.md',
    body: 'Ada Memory\n',
    expectedHead: seed,
    editId: 'seed-persona',
  });
  git(memoryRoot, 'switch', '-c', 'history', persona.sha);
  writeFileSync(join(memoryRoot, 'draft.md'), 'Historical Memory edit\n');
  git(memoryRoot, 'add', 'draft.md');
  git(memoryRoot, 'commit', '-m', 'Historical draft');
  const historyHead = git(memoryRoot, 'rev-parse', 'HEAD');
  git(memoryRoot, 'switch', 'main');

  const orchestratorSessions: string[] = [];
  const requests: Array<{ sessionId: string; text: string }> = [];
  let assignmentRun: AssignmentAgentRun | undefined;
  let finishAssignment: (() => void) | undefined;
  let markBlockedSeen: (() => void) | undefined;
  const blockedSeen = new Promise<void>((resolve) => {
    markBlockedSeen = resolve;
  });
  const agents: BotAgentAdapter = {
    async runOrchestrator(run) {
      orchestratorSessions.push(run.sessionId);
      if (run.message.endsWith('start assignment')) {
        const created = run.assignments.create({
          grantId: TEST_GRANT_ID,
          purpose: 'Continue related project work while Memory is being updated',
          key: 'related-work',
        });
        expect(created.outcome).toBe('created');
        return;
      }
      if (run.message.includes('Switch Memory')) {
        await run.channels.send({ body: 'Requested Memory branch: history' });
        expect(() => run.memory!.switchBranch('history')).toThrow(
          /Git could not switch Memory branch/,
        );
        const working = run.assignments.list().find((item) => item.activity === 'working');
        expect(working).toBeDefined();
        await run.channels.send({ body: 'Memory branch history blocked; preserving staged work.' });
        run.assignments.request({
          sessionId: working!.sessionId,
          mode: 'next-step',
          text: 'Pause related work, preserve your workspace, then report so I can switch Memory.',
        });
        await run.channels.send({ body: 'Coordinating with Assignment ' + working!.sessionId });
        return;
      }
      if (run.inbox.includes('Cannot pause') && !run.inbox.includes('Assignment paused')) {
        expect(() => run.memory!.switchBranch('history')).toThrow(
          /Git could not switch Memory branch/,
        );
        await run.channels.send({
          body: 'Memory branch history still blocked; staged work remains.',
        });
        markBlockedSeen?.();
        return;
      }
      expect(run.inbox).toContain('Assignment paused');
      git(
        memoryRoot,
        'stash',
        'push',
        '--include-untracked',
        '-m',
        'Memory branch switch checkpoint',
      );
      const switched = run.memory!.switchBranch('history');
      expect(switched.to).toBe('history');
      expect(readFileSync(join(memoryRoot, 'PERSONA.md'), 'utf8')).toContain('Ada');
      await run.channels.send({ body: 'Memory branch switched to history.' });
    },
    runAssignment(run) {
      assignmentRun = run;
      return new Promise<void>((resolve) => {
        finishAssignment = resolve;
      });
    },
    requestAssignment(run) {
      requests.push({ sessionId: run.sessionId, text: run.purpose });
      return { delivery: 'steer' };
    },
    async close() {},
  };
  const runtime = createBotRuntime({
    database: owner,
    registry,
    channels,
    agents,
    memory,
    ownership,
    grants: createTestWorkspaceGrants(owner, home),
    orchestratorCwd: () => memoryRoot,
    now: FIXED_NOW,
  });
  try {
    const firstMessage = {
      id: 'human-start',
      at: FIXED_NOW().toISOString(),
      author: { kind: 'human' as const },
      body: 'start assignment',
    };
    await channels.appendMessage(dm.id, firstMessage);
    await admit(runtime, dm.id, firstMessage.id, firstMessage.body);
    expect(assignmentRun).toBeDefined();
    writeFileSync(join(memoryRoot, 'draft.md'), 'Unfinished Memory edit\n');
    git(memoryRoot, 'add', 'draft.md');
    writeFileSync(join(memoryRoot, 'untracked.md'), 'Untracked Memory edit\n');

    const switchMessage = {
      id: 'human-switch',
      at: FIXED_NOW().toISOString(),
      author: { kind: 'human' as const },
      body: 'Switch Memory to history',
      memorySwitchTarget: 'history',
    };
    await channels.appendMessage(dm.id, switchMessage);
    await admit(runtime, dm.id, switchMessage.id, switchMessage.body);
    expect(git(memoryRoot, 'branch', '--show-current')).toBe('main');
    expect(git(memoryRoot, 'diff', '--cached', '--name-only')).toBe('draft.md');
    expect(requests).toHaveLength(1);
    expect(requests[0]?.sessionId).toBe(assignmentRun!.sessionId);

    await assignmentRun!.report({ state: 'blocked', summary: 'Cannot pause yet; still writing.' });
    await blockedSeen;
    expect(git(memoryRoot, 'branch', '--show-current')).toBe('main');
    expect(git(memoryRoot, 'diff', '--cached', '--name-only')).toBe('draft.md');

    await assignmentRun!.report({
      state: 'completed',
      summary: 'Assignment paused; project files preserved.',
    });
    finishAssignment?.();
    await runtime.whenIdle();

    expect(orchestratorSessions).toHaveLength(4);
    expect(new Set(orchestratorSessions).size).toBe(1);
    expect(git(memoryRoot, 'branch', '--show-current')).toBe('history');
    expect(git(memoryRoot, 'stash', 'show', '--include-untracked', '-p')).toContain(
      'Unfinished Memory edit',
    );
    expect(git(memoryRoot, 'stash', 'show', '--include-untracked', '-p')).toContain(
      'Untracked Memory edit',
    );
    expect(memory.gitGraph('ada').currentBranch).toBe('history');
    const reopenedMemory = createMemoryService({
      registry,
      ownership,
      database: owner,
      now: FIXED_NOW,
    });
    expect(reopenedMemory.gitGraph('ada').currentBranch).toBe('history');
    expect(reopenedMemory.snapshot('ada').head).toBe(historyHead);
    const messages = channels
      .readMessages(dm.id)
      .map((item) => item.body)
      .join('\n');
    expect(messages).toContain('Requested Memory branch: history');
    expect(messages).toContain('history blocked');
    expect(messages).toContain('history still blocked');
    expect(messages).toContain('Coordinating with Assignment');
    expect(messages).toContain('Memory branch switched to history.');

    const reloaded = createChannelStore({ rootDir: join(home, 'channels'), now: FIXED_NOW });
    expect(
      reloaded
        .readMessages(dm.id)
        .map((item) => item.body)
        .join('\n'),
    ).toContain('Memory branch switched to history.');
  } finally {
    finishAssignment?.();
    await runtime.whenIdle();
    await runtime.close();
    owner.close();
  }
});
