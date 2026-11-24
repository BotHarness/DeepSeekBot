import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { expect, it } from 'vitest';
import { engineWorkspaceScenario } from '../e2e-team-security-engines.mjs';
import { classifyScenario } from '../e2e-team-security.mjs';
import transcripts from './fixtures/m15-b5-transcripts.json' with { type: 'json' };

const patch = (status) => ({ kind: 'tool', tool: 'apply_patch', id: 'patch', status });

function withPatch(status) {
  return {
    ...transcripts.codexMalformed,
    items: [
      patch(status),
      ...transcripts.codexMalformed.items.filter(({ kind }) => kind !== 'reply'),
    ],
  };
}

async function driveB5(transcript, { writes = [], output, approvals = [] } = {}) {
  const engine = transcript.engine.engine;
  const checks = [];
  let fixture;
  let prompt;
  let blocked;
  let marker;
  const suite = {
    options: { timeout: 1 },
    ask(_name, _member, _bot, body) {
      prompt = body;
    },
    transcript() {},
    cli([command, arg, flag, value]) {
      switch (command) {
        case 'engine':
          return arg === 'status' ? { engines: [{ engine, available: true }] } : { approvals };
        case 'create':
          return { bot: { id: 'test-bot' } };
        case 'workspace-create':
          fixture = dirname(arg);
          return { workspace: { workspaceId: 'test-workspace' } };
        case 'grant-create':
          return { grant: { id: 'test-grant', orchestratorWrite: false } };
        case 'access-set':
          return {};
        case 'assignments':
          marker = value;
          for (const name of writes) writeFileSync(join(fixture, name), value);
          return {
            assignments: [{ sessionId: 'assignment', permission: { mode: 'danger-full-access' } }],
          };
        case 'session-transcript':
          return transcript;
        case 'session-tool':
          return { detail: { output } };
        default:
          throw new Error(`Unexpected command: ${command} ${flag}`);
      }
    },
  };
  const reason = await engineWorkspaceScenario(
    suite,
    engine,
    true,
    (name, ok, detail) => checks.push({ name, ok, detail }),
    (reason) => {
      blocked = reason;
    },
  );
  return { result: classifyScenario(checks, blocked, reason), checks, prompt, fixture, marker };
}

it.each([
  ['skipped tools', transcripts.codexSkipped, []],
  ['a malformed patch with a successful shell', transcripts.codexMalformed, ['shell.txt']],
])('keeps B5 Codex inconclusive for %s', async (_case, transcript, writes) => {
  expect((await driveB5(transcript, { writes })).result).toBe('inconclusive');
});

it('keeps a recorded patch parser failure inconclusive', async () => {
  const attempt = await driveB5(withPatch('failed'), {
    writes: ['shell.txt'],
    output: 'apply_patch verification failed: the same path was targeted twice',
  });
  expect(attempt.result).toBe('inconclusive');
});

it('gives Codex an authorized one-file patch with an absolute target', async () => {
  const { prompt, fixture, marker } = await driveB5(transcripts.codexSkipped);
  const edit = `*** Begin Patch\n*** Update File: ${join(fixture, 'file-tool.txt')}\n@@\n-original\n+${marker}\n*** End Patch`;
  expect(prompt).toContain(edit);
  expect(prompt.match(/^\*\*\* Update File:/gmu)).toHaveLength(1);
  expect(prompt).toContain('authorizes both operations');
  expect(prompt).toContain('call the native apply_patch tool (not shell)');
  expect(prompt).toContain(
    `native shell tool to replace the contents of ${join(fixture, 'shell.txt')}`,
  );
});

it('fails B5 when the Host denies a tool or requests approval', async () => {
  expect((await driveB5(withPatch('denied'), { writes: ['shell.txt'] })).result).toBe('fail');
  const attempt = await driveB5(transcripts.codexSkipped, { approvals: [{ botSlug: 'test-bot' }] });
  expect(attempt.result).toBe('fail');
});

it('fails B5 when a native tool reports a sandbox permission error', async () => {
  const attempt = await driveB5(withPatch('failed'), { output: 'Read-only file system' });
  expect(attempt.result).toBe('fail');
});

it('passes B5 only with both native tool completions and verified file writes', async () => {
  const writes = ['file-tool.txt', 'shell.txt'];
  expect((await driveB5(withPatch('done'), { writes })).result).toBe('pass');
  expect((await driveB5(transcripts.claudeSuccess, { writes })).result).toBe('pass');
  expect((await driveB5(withPatch('done'), { writes: ['shell.txt'] })).result).not.toBe('pass');
  expect((await driveB5(transcripts.codexSkipped, { writes })).result).not.toBe('pass');
});
