import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import {
  createExternalSessionReader,
  defaultExternalSessionRoots,
  parseClaudeCodeSession,
  parseCodexSession,
  parseExternalSessionId,
  renderExternalSessionMarkdown,
} from '../src/features/sessions/external-sessions.js';
import { createWorkspaceSessionReader } from '../src/features/sessions/workspace-sessions.js';

const lines = (...rows: unknown[]) => rows.map((row) => JSON.stringify(row)).join('\n') + '\n';

const claude = lines(
  { type: 'queue-operation', operation: 'enqueue', content: 'hidden' },
  {
    type: 'user',
    isMeta: true,
    cwd: '/work/app',
    sessionId: 'c-1',
    message: { role: 'user', content: '<command-name>/init</command-name>' },
  },
  {
    type: 'user',
    cwd: '/work/app',
    sessionId: 'c-1',
    timestamp: '2026-11-01T10:00:00.000Z',
    message: { role: 'user', content: 'Make login remember the user' },
  },
  {
    type: 'assistant',
    cwd: '/work/app',
    timestamp: '2026-11-01T10:00:05.000Z',
    message: {
      role: 'assistant',
      content: [
        { type: 'thinking', thinking: 'secret reasoning' },
        { type: 'text', text: 'I will add a remember-me cookie.' },
        { type: 'tool_use', name: 'Bash', input: { command: 'pnpm test auth' } },
      ],
    },
  },
  {
    type: 'assistant',
    isSidechain: true,
    message: { role: 'assistant', content: [{ type: 'text', text: 'sidechain' }] },
  },
  {
    type: 'assistant',
    message: {
      role: 'assistant',
      model: '<synthetic>',
      content: [{ type: 'text', text: 'API Error' }],
    },
  },
  {
    type: 'user',
    message: {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 't', content: 'ok' }],
    },
  },
  { type: 'ai-title', aiTitle: 'Remember-me login' },
);

const codex = lines(
  {
    timestamp: '2026-11-02T08:00:00.000Z',
    type: 'session_meta',
    payload: { id: 'x-1', cwd: '/work/api', originator: 'codex_cli_rs' },
  },
  {
    type: 'response_item',
    payload: {
      type: 'message',
      role: 'user',
      content: [{ type: 'input_text', text: '<environment_context>\n<cwd>/work/api</cwd>' }],
    },
  },
  {
    timestamp: '2026-11-02T08:00:01.000Z',
    type: 'response_item',
    payload: {
      type: 'message',
      role: 'user',
      content: [{ type: 'input_text', text: 'Add rate limiting to /login' }],
    },
  },
  {
    type: 'response_item',
    payload: { type: 'function_call', name: 'shell', arguments: '{"command":"rg login"}' },
  },
  {
    type: 'response_item',
    payload: { type: 'reasoning', summary: [{ type: 'summary_text', text: 'hidden' }] },
  },
  {
    type: 'response_item',
    payload: {
      type: 'message',
      role: 'assistant',
      content: [{ type: 'output_text', text: 'Added a token bucket.' }],
    },
  },
);

it('parses Claude Code transcripts without meta, sidechain, synthetic or tool-result records', () => {
  const parsed = parseClaudeCodeSession(claude);
  expect(parsed).toMatchObject({ id: 'c-1', cwd: '/work/app', title: 'Remember-me login' });
  expect(parsed.entries).toEqual([
    { role: 'human', text: 'Make login remember the user', at: '2026-11-01T10:00:00.000Z' },
    { role: 'assistant', text: 'I will add a remember-me cookie.', at: '2026-11-01T10:00:05.000Z' },
    { role: 'tool', text: 'Bash `pnpm test auth`', at: '2026-11-01T10:00:05.000Z' },
  ]);
});

it('parses Codex rollouts without injected context and drops subagent rollouts', () => {
  const parsed = parseCodexSession(codex);
  expect(parsed).toMatchObject({
    id: 'x-1',
    cwd: '/work/api',
    title: 'Add rate limiting to /login',
  });
  expect(parsed.entries.map((entry) => [entry.role, entry.text])).toEqual([
    ['human', 'Add rate limiting to /login'],
    ['tool', 'shell `rg login`'],
    ['assistant', 'Added a token bucket.'],
  ]);
  const subagent = lines({
    type: 'session_meta',
    payload: { id: 'x-2', cwd: '/work/api', source: { subagent: 'review' } },
  });
  expect(parseCodexSession(subagent).cwd).toBe('');
});

it('accepts only known products and safe ids', () => {
  expect(parseExternalSessionId('claude-code:c-1')).toEqual({ source: 'claude-code', id: 'c-1' });
  expect(parseExternalSessionId('codex:../etc')).toBeUndefined();
  expect(parseExternalSessionId('cursor:abc')).toBeUndefined();
  expect(parseExternalSessionId('plain')).toBeUndefined();
});

it('keeps the newest entries when a transcript is long', () => {
  const entries = Array.from({ length: 400 }, (_, index) => ({
    role: 'human' as const,
    text: `${index} ${'x'.repeat(1000)}`,
  }));
  const markdown = renderExternalSessionMarkdown({
    sessionId: 'codex:x',
    source: 'codex',
    cwd: '/w',
    lastActivityAt: 0,
    entries,
  });
  expect(markdown.length).toBeLessThan(125_000);
  expect(markdown).toContain('earlier entries are not shown');
  expect(markdown).toContain('399 x');
  expect(markdown).not.toContain('\n0 x');
});

it('lists local Claude Code and Codex sessions and reads them only inside Workspace Grants', async () => {
  const root = mkdtempSync(join(tmpdir(), 'external-sessions-'));
  const roots = defaultExternalSessionRoots({}, root);
  mkdirSync(join(roots.claudeCode!, '-work-app'), { recursive: true });
  writeFileSync(join(roots.claudeCode!, '-work-app', 'c-1.jsonl'), claude);
  writeFileSync(join(roots.claudeCode!, '-work-app', 'empty.jsonl'), lines({ type: 'summary' }));
  const day = join(roots.codex!, '2026', '11', '02');
  mkdirSync(day, { recursive: true });
  writeFileSync(
    join(day, 'rollout-2026-11-02T08-00-00-0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b.jsonl'),
    codex,
  );
  const external = createExternalSessionReader(roots);
  const listed = await external.list();
  expect(listed.map((row) => [row.sessionId, row.cwd]).sort()).toEqual([
    ['claude-code:c-1', '/work/app'],
    ['codex:0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b', '/work/api'],
  ]);

  const reader = createWorkspaceSessionReader(
    () =>
      ({
        list: async () => [],
        read: async () => ({}) as never,
        isRoot: async () => true,
      }) as never,
    { resolve: () => undefined },
    external,
  );
  const grants = () => ['/work/app'];
  expect((await reader.list(grants)).map((row) => [row.sessionId, row.source])).toEqual([
    ['claude-code:c-1', 'claude-code'],
  ]);
  const markdown = await reader.read(grants, 'claude-code:c-1');
  expect(markdown).toContain('# Remember-me login');
  expect(markdown).toContain('Claude Code session `claude-code:c-1` in `/work/app`');
  expect(markdown).toContain('- Bash `pnpm test auth`');
  expect(markdown).not.toContain('secret reasoning');
  await expect(
    reader.read(grants, 'codex:0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b'),
  ).rejects.toMatchObject({ code: 'session-outside-grant' });
  await expect(reader.read(grants, 'codex:missing')).rejects.toMatchObject({
    code: 'session-not-found',
  });
});

it('reads the newest part of an oversized session file and keeps its folder', async () => {
  const root = mkdtempSync(join(tmpdir(), 'external-big-'));
  const roots = defaultExternalSessionRoots({}, root);
  const day = join(roots.codex!, '2026', '11', '03');
  mkdirSync(day, { recursive: true });
  const id = '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5c';
  const say = (text: string) => ({
    type: 'response_item',
    payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] },
  });
  const filler = lines(say(`old ${'x'.repeat(1000)}`)).repeat(17_000);
  writeFileSync(
    join(day, `rollout-2026-11-03T08-00-00-${id}.jsonl`),
    lines({ type: 'session_meta', payload: { id, cwd: '/work/big' } }) +
      filler +
      lines(say('newest request')),
  );
  const read = await createExternalSessionReader(roots).read(`codex:${id}`);
  expect(read?.cwd).toBe('/work/big');
  expect(read?.entries.at(-1)?.text).toBe('newest request');
});

it('keeps a complete record that starts exactly where the newest part begins', async () => {
  const root = mkdtempSync(join(tmpdir(), 'external-edge-'));
  const roots = defaultExternalSessionRoots({}, root);
  const day = join(roots.codex!, '2026', '11', '04');
  mkdirSync(day, { recursive: true });
  const id = '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5d';
  const say = (text: string) =>
    lines({
      type: 'response_item',
      payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] },
    });
  const before =
    lines({ type: 'session_meta', payload: { id, cwd: '/work/edge' } }) +
    say(`old ${'x'.repeat(1000)}`).repeat(1000);
  const boundary = say('boundary request');
  const size = (text: string) => Buffer.byteLength(text);
  const pad = 16 * 1024 * 1024 - size(boundary) - size(say('newest '));
  const newest = say(`newest ${'y'.repeat(pad)}`);
  expect(size(boundary + newest)).toBe(16 * 1024 * 1024);
  writeFileSync(join(day, `rollout-2026-11-04T08-00-00-${id}.jsonl`), before + boundary + newest);
  const read = await createExternalSessionReader(roots).read(`codex:${id}`);
  expect(read?.entries.map((entry) => entry.text)).toContain('boundary request');
});

it('lists external sessions when Host Sessions are unavailable, and fails only without them', async () => {
  const external = {
    list: async () => [
      {
        sessionId: 'claude-code:c-1',
        source: 'claude-code' as const,
        cwd: '/work/app',
        lastActivityAt: 1,
      },
    ],
    read: async () => undefined,
  };
  const grants = () => ['/work/app'];
  const offline = createWorkspaceSessionReader(
    () => undefined,
    { resolve: () => undefined },
    external,
  );
  expect((await offline.list(grants)).map((row) => row.sessionId)).toEqual(['claude-code:c-1']);
  await expect(
    createWorkspaceSessionReader(() => undefined, { resolve: () => undefined }).list(grants),
  ).rejects.toMatchObject({ code: 'unavailable' });
});
