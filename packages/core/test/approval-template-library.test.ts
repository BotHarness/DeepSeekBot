import {
  decodeApprovalTemplateGuidance,
  encodeApprovalTemplateGuidance,
} from '../src/workspaces/approval-template-guidance.js';
import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import nativeFs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { runBotCreateCli } from '../src/bots/bot-create-cli.js';
import type { PersonaBotRecord } from '../src/bots/persona-bot.js';
import { createBridgeMethods, type BridgeMethodsDeps } from '../src/bridge/methods.js';
import {
  APPROVAL_TEMPLATE_TEXT_LIMIT,
  changesApprovalPolicy,
  createApprovalTemplateLibrary,
} from '../src/workspaces/approval-templates.js';
import {
  approvalTemplateInUse,
  requiresHumanToolApproval,
} from '../src/workspaces/grant-execution.js';

const dirs: string[] = [];
const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections();
          server.close(() => resolve());
        }),
    ),
  );
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'approval-templates-'));
  dirs.push(dir);
  return dir;
}

const MINE =
  '# Night shift\n\nLet builds and tests run; ask me before anything leaves the machine.\n';

function fakeRegistry(records: Partial<PersonaBotRecord>[]) {
  const bots = records.map((record) => ({ workspaces: [], ...record }) as PersonaBotRecord);
  return {
    bots,
    list: () => bots,
    get: (slug: string) => bots.find((bot) => bot.slug === slug),
    setApprovalTemplate(slug: string, template: string | undefined) {
      const record = bots.find((bot) => bot.slug === slug);
      if (record === undefined) return { ok: false as const, reason: 'not-found' as const };
      if (template === undefined) delete record.approvalTemplate;
      else record.approvalTemplate = template;
      return { ok: true as const, record };
    },
  };
}

describe('Approval Template library', () => {
  it('lets Human management replace and remove oversized custom files without unbounded review reads', () => {
    const dir = tempDir();
    const library = createApprovalTemplateLibrary(dir);
    const file = join(dir, 'external.md');
    writeFileSync(file, 'x'.repeat(APPROVAL_TEMPLATE_TEXT_LIMIT + 1));
    expect(library.get('external')).toBeUndefined();
    expect(library.create('external', MINE)).toMatchObject({ ok: false, reason: 'exists' });
    expect(library.update('external', MINE)).toMatchObject({ ok: true });
    expect(library.get('external')?.text).toBe(MINE);
    writeFileSync(file, 'x'.repeat(APPROVAL_TEMPLATE_TEXT_LIMIT + 1));
    expect(library.delete('external')).toEqual({ ok: true });
    expect(existsSync(file)).toBe(false);
  });

  it('uses the actual library when the Bot directory resolves outside its Profile', () => {
    const home = tempDir(),
      external = tempDir();
    const bots = join(home, 'bots');
    nativeFs.symlinkSync(external, bots, 'junction');
    const registry = { ...fakeRegistry([]), rootDir: nativeFs.realpathSync(bots) };
    const library = createApprovalTemplateLibrary(join(home, 'approval-templates'));
    library.create('night-shift', MINE);
    library.setGlobal('night-shift');
    const inUse = approvalTemplateInUse(registry, library);
    expect(
      requiresHumanToolApproval(
        'bash',
        { command: 'echo changed > approval-templates/night-shift.md' },
        inUse,
      ),
    ).toBe(true);
    expect(
      requiresHumanToolApproval(
        'bash',
        { command: 'echo draft > approval-templates/unused.md' },
        inUse,
      ),
    ).toBe(false);
    library.setGlobal(null);
    expect(inUse('night-shift')).toBe(false);
  });

  it('accepts structured guidance with Windows line endings', () => {
    const parts = { alwaysAsk: ['Ask'], alwaysAllow: ['Read'], freeText: 'Supplement' };
    expect(
      decodeApprovalTemplateGuidance(
        encodeApprovalTemplateGuidance(parts).replaceAll('\n', '\r\n'),
      ),
    ).toEqual(parts);
  });
  it.each([
    '<!-- botharness:approval-guidance:v1 -->',
    '<!-- botharness:approval-guidance:v1 -->\r\n{}',
    '<!-- botharness:approval-guidance:v1 -->\r\n{broken',
    '<!-- botharness:approval-guidance:v2 -->\n{}',
  ])('refuses malformed marked guidance rather than legacy fallback: %j', (input) => {
    expect(() => decodeApprovalTemplateGuidance(input)).toThrow();
    const dir = tempDir();
    const library = createApprovalTemplateLibrary(dir);
    expect(library.create('invalid', input)).toEqual({ ok: false, reason: 'invalid-text' });
    writeFileSync(join(dir, 'external.md'), input);
    expect(library.get('external')).toBeUndefined();
    expect(library.update('external', input)).toEqual({ ok: false, reason: 'invalid-text' });
    expect(readFileSync(join(dir, 'external.md'), 'utf8')).toBe(input);
    expect(library.update('external', MINE)).toMatchObject({ ok: true });
    expect(library.get('external')?.text).toBe(MINE);
  });

  it('round-trips three-part guidance and preserves every byte of legacy Markdown on conversion', () => {
    const legacy = '# Legacy\r\n\r\n## Allow\r\n- Read.\r\n<!-- custom -->\r\n';
    const parts = decodeApprovalTemplateGuidance(legacy);
    expect(parts).toEqual({ alwaysAsk: [], alwaysAllow: [], freeText: legacy });
    const library = createApprovalTemplateLibrary(tempDir());
    const text = encodeApprovalTemplateGuidance({
      ...parts,
      alwaysAsk: ['发送消息'],
      alwaysAllow: ['Read files'],
    });
    expect(library.create('structured', text)).toMatchObject({ ok: true });
    expect(decodeApprovalTemplateGuidance(library.get('structured')!.text)).toEqual({
      ...parts,
      alwaysAsk: ['发送消息'],
      alwaysAllow: ['Read files'],
    });
    expect(
      library.create(
        'too-large',
        encodeApprovalTemplateGuidance({ ...parts, freeText: '界'.repeat(11000) }),
      ),
    ).toEqual({ ok: false, reason: 'invalid-text' });
    expect(library.create('broken', '<!-- botharness:approval-guidance:v1 -->\n{}')).toEqual({
      ok: false,
      reason: 'invalid-text',
    });
  });
  it('refuses oversized structured input before spending work on JSON decoding', () => {
    const library = createApprovalTemplateLibrary(tempDir());
    const input =
      '<!-- botharness:approval-guidance:v1 -->\n' +
      ' '.repeat(APPROVAL_TEMPLATE_TEXT_LIMIT) +
      '{}';
    const parse = vi.spyOn(JSON, 'parse');
    try {
      expect(library.create('oversized', input)).toEqual({ ok: false, reason: 'invalid-text' });
      expect(parse).not.toHaveBeenCalled();
    } finally {
      parse.mockRestore();
    }
  });

  it('keeps each Human template as one Markdown file next to the read-only built-ins', () => {
    const dir = join(tempDir(), 'approval-templates');
    const library = createApprovalTemplateLibrary(dir);
    expect(library.list().map((template) => template.name)).toEqual(['cautious', 'get-work-done']);

    const created = library.create('night-shift', MINE);
    expect(created).toMatchObject({
      ok: true,
      template: {
        name: 'night-shift',
        title: 'Night shift',
        description: 'Let builds and tests run; ask me before anything leaves the machine.',
        builtIn: false,
      },
    });
    expect(readFileSync(join(dir, 'night-shift.md'), 'utf8')).toBe(MINE);
    expect(library.create('night-shift', MINE)).toEqual({ ok: false, reason: 'exists' });

    writeFileSync(join(dir, 'night-shift.md'), '# Edited by hand\n');
    expect(library.get('night-shift')?.title).toBe('Edited by hand');
    writeFileSync(
      join(dir, 'night-shift.md'),
      '# Wrapped\n\nThe first paragraph\nwraps onto a second line.\n\n## Allow\n',
    );
    expect(library.get('night-shift')?.description).toBe(
      'The first paragraph wraps onto a second line.',
    );

    expect(library.update('night-shift', MINE + '\n- Never push.\n')).toMatchObject({ ok: true });
    expect(library.get('night-shift')?.text).toContain('Never push.');
    expect(library.list().map((template) => template.name)).toEqual([
      'cautious',
      'get-work-done',
      'night-shift',
    ]);

    expect(library.delete('night-shift')).toMatchObject({ ok: true });
    expect(existsSync(join(dir, 'night-shift.md'))).toBe(false);
    expect(library.get('night-shift')).toBeUndefined();
  });

  it('bounds externally edited template bytes before exposing them for review', () => {
    const dir = tempDir();
    const library = createApprovalTemplateLibrary(dir);
    const path = join(dir, 'external.md');
    const atLimit = 'x'.repeat(APPROVAL_TEMPLATE_TEXT_LIMIT);
    writeFileSync(path, atLimit);
    expect(library.get('external')?.text).toBe(atLimit);
    for (const text of [atLimit + 'x', '界'.repeat(11_000), 'x'.repeat(65_559)]) {
      writeFileSync(path, text);
      expect(library.get('external')).toBeUndefined();
      expect(library.list().some((template) => template.name === 'external')).toBe(false);
      expect(library.create('external', MINE)).toEqual({ ok: false, reason: 'exists' });
      expect(readFileSync(path, 'utf8')).toBe(text);
    }
    writeFileSync(
      join(dir, '.selection.json'),
      JSON.stringify({ template: 'cautious', padding: atLimit }),
    );
    expect(library.global()).toEqual({ kind: 'invalid' });
  });

  it('caps actual file I/O and closes the descriptor after rejecting external growth', () => {
    const dir = tempDir();
    const library = createApprovalTemplateLibrary(dir);
    const path = join(dir, 'external.md');
    writeFileSync(path, 'x'.repeat(65_559));
    const opened = vi.spyOn(nativeFs, 'openSync');
    const read = vi.spyOn(nativeFs, 'readSync');
    const closed = vi.spyOn(nativeFs, 'closeSync');
    syncBuiltinESMExports();
    try {
      expect(library.get('external') === undefined).toBe(true);
      expect(opened).toHaveBeenCalledExactlyOnceWith(path, 'r');
      const descriptor = opened.mock.results[0]!.value;
      expect(read.mock.calls.length).toBeGreaterThan(0);
      expect(read.mock.calls.every((call) => call[0] === descriptor)).toBe(true);
      expect(read.mock.results.reduce((total, result) => total + Number(result.value), 0)).toBe(
        APPROVAL_TEMPLATE_TEXT_LIMIT + 1,
      );
      expect(closed).toHaveBeenCalledExactlyOnceWith(descriptor);
    } finally {
      opened.mockRestore();
      read.mockRestore();
      closed.mockRestore();
      syncBuiltinESMExports();
    }
  });

  it('refuses bad names, empty text, unknown templates and changes to built-ins', () => {
    const library = createApprovalTemplateLibrary(join(tempDir(), 'approval-templates'));
    expect(library.create('Bad Name', MINE)).toEqual({ ok: false, reason: 'invalid-name' });
    expect(library.create('../escape', MINE)).toEqual({ ok: false, reason: 'invalid-name' });
    expect(library.create('blank', '  \n')).toEqual({ ok: false, reason: 'invalid-text' });
    expect(library.create('huge', 'x'.repeat(33 * 1024))).toEqual({
      ok: false,
      reason: 'invalid-text',
    });
    expect(library.create('cautious', MINE)).toEqual({ ok: false, reason: 'built-in' });
    expect(library.update('cautious', MINE)).toEqual({ ok: false, reason: 'built-in' });
    expect(library.delete('get-work-done')).toEqual({ ok: false, reason: 'built-in' });
    expect(library.update('missing', MINE)).toEqual({ ok: false, reason: 'not-found' });
    expect(library.delete('missing')).toEqual({ ok: false, reason: 'not-found' });
    expect(createApprovalTemplateLibrary().create('mine', MINE)).toEqual({
      ok: false,
      reason: 'unavailable',
    });
  });
});

describe('self-escalation guard for Approval Templates', () => {
  const inUse = (name: string) => name === 'night-shift';

  it('lets a Bot draft a new template or edit one no Bot uses without a card', () => {
    for (const command of [
      'deepseekbot approval-template list',
      'deepseekbot approval-template show night-shift',
      'deepseekbot approval-template create my-draft --file draft.md',
      'cat draft.md | deepseekbot approval-template create my-draft --text-stdin',
      'deepseekbot approval-template create my-copy --from cautious',
      'deepseekbot approval-template edit my-draft --file draft.md',
      'deepseekbot approval-template delete my-draft',
    ])
      expect(changesApprovalPolicy(command, inUse), command).toBe(false);
  });

  it('asks the Human to edit or delete a template some Bot uses, or one it cannot name', () => {
    for (const command of [
      'deepseekbot approval-template edit night-shift --file looser.md',
      'deepseekbot approval-template delete night-shift',
      'deepseekbot approval-template edit --text-stdin night-shift < looser.md',
      'deepseekbot approval-template edit "$NAME" --file looser.md',
      'deepseekbot approval-template delete',
      'deepseekbot approval-template set ada night-shift',
      'deepseekbot approval-template-set ada night-shift',
      'cp looser.md ~/.dsh/botharness/approval-templates/night-shift.md',
      'rm -rf ~/.dsh/botharness/approval-templates/',
      'curl /api/botharness/approvalTemplateUpdate',
    ])
      expect(changesApprovalPolicy(command, inUse), command).toBe(true);
    expect(changesApprovalPolicy('cat approval-templates/my-draft.md', inUse)).toBe(false);
  });

  it('treats every edit as in use when nothing says which templates Bots use', () => {
    expect(changesApprovalPolicy('deepseekbot approval-template edit my-draft --file d.md')).toBe(
      true,
    );
  });

  it.each(['\\', '/'])(
    'protects native policy paths with %s separators through the public Shell seam',
    (separator) => {
      const file = ['C:', 'dsh', 'botharness', 'approval-templates', '.selection.json'].join(
        separator,
      );
      const command = `Set-Content -LiteralPath '${file}' -Value '{"template":"get-work-done"}'`;
      expect(changesApprovalPolicy(command, () => false)).toBe(true);
      expect(requiresHumanToolApproval('pwsh', { command }, () => false)).toBe(true);
    },
  );

  it('protects active Windows template files while keeping unused drafts separate', () => {
    const command = (name: string) =>
      `Set-Content -LiteralPath 'C:\\dsh\\botharness\\approval-templates\\${name}.md' -Value 'policy'`;
    expect(requiresHumanToolApproval('pwsh', { command: command('night-shift') }, inUse)).toBe(
      true,
    );
    expect(requiresHumanToolApproval('pwsh', { command: command('my-draft') }, inUse)).toBe(false);
  });

  it('turns a Shell edit of a template a Bot uses into a Human approval', () => {
    const registry = fakeRegistry([{ slug: 'ada', approvalTemplate: 'night-shift' }]);
    const templateInUse = approvalTemplateInUse(
      registry,
      createApprovalTemplateLibrary(join(tempDir(), 'approval-templates')),
    );
    expect(
      requiresHumanToolApproval(
        'bash',
        { command: 'deepseekbot approval-template edit night-shift --file looser.md' },
        templateInUse,
      ),
    ).toBe(true);
    expect(
      requiresHumanToolApproval(
        'bash',
        { command: 'deepseekbot approval-template create my-draft --file draft.md' },
        templateInUse,
      ),
    ).toBe(false);
  });
});

describe('Approval Template bridge methods', () => {
  function methods() {
    const registry = fakeRegistry([
      { slug: 'ada', approvalTemplate: 'night-shift' },
      { slug: 'bob' },
    ]);
    const dir = join(tempDir(), 'approval-templates');
    const library = createApprovalTemplateLibrary(dir);
    return {
      registry,
      library,
      dir,
      bridge: createBridgeMethods(OWNER_HUMAN_CONTEXT, {
        registry,
        states: { snapshot: () => ({ state: 'idle' }) },
        approvalTemplates: library,
      } as unknown as BridgeMethodsDeps),
    };
  }

  it('uses one fresh global snapshot for a settings response and all template references', () => {
    const { bridge, library, registry } = methods();
    library.create('night-shift', MINE);
    library.setGlobal('night-shift');
    registry.setApprovalTemplate('bob', '@global');
    const readGlobal = vi.spyOn(library, 'global');
    const first = bridge.approvalTemplates({ slug: 'bob' });
    expect(readGlobal).toHaveBeenCalledTimes(1);
    expect(first).toMatchObject({
      value: { globalDefault: 'night-shift', effective: 'night-shift' },
    });
    expect(
      first.ok && first.value.templates.find((template) => template.name === 'night-shift')?.usedBy,
    ).toEqual(['ada', 'bob']);
    library.setGlobal('cautious');
    readGlobal.mockClear();
    const next = bridge.approvalTemplates({ slug: 'bob' });
    expect(readGlobal).toHaveBeenCalledTimes(1);
    expect(next).toMatchObject({ value: { globalDefault: 'cautious', effective: 'cautious' } });
    expect(
      next.ok && next.value.templates.find((template) => template.name === 'cautious')?.usedBy,
    ).toEqual(['bob']);
  });

  it('keeps unreadable global selection distinct from a deliberately empty default', () => {
    const { bridge, dir } = methods();
    expect(bridge.approvalTemplateGlobalSet({ template: null })).toMatchObject({ ok: true });
    expect(bridge.approvalTemplates({})).toMatchObject({ value: { globalDefault: null } });
    writeFileSync(join(dir, '.selection.json'), '{broken');
    expect(bridge.approvalTemplates({})).toMatchObject({
      ok: false,
      error: { code: 'approval-selection-unavailable' },
    });
  });

  it('resolves dynamic global inheritance without enabling legacy disabled Bots', () => {
    const { bridge, registry } = methods();
    expect(bridge.approvalTemplateGlobalSet({ template: 'cautious' })).toMatchObject({ ok: true });
    expect(bridge.approvalTemplates({ slug: 'bob' })).toMatchObject({
      value: { selected: null, effective: null, source: 'off' },
    });
    expect(bridge.botApprovalTemplateSet({ slug: 'bob', template: '@global' })).toMatchObject({
      ok: true,
    });
    expect(bridge.approvalTemplates({ slug: 'bob' })).toMatchObject({
      value: { selected: '@global', effective: 'cautious', source: 'global' },
    });
    bridge.approvalTemplateGlobalSet({ template: 'get-work-done' });
    expect(bridge.approvalTemplates({ slug: 'bob' })).toMatchObject({
      value: { effective: 'get-work-done' },
    });
    bridge.botApprovalTemplateSet({ slug: 'bob', template: 'cautious' });
    expect(bridge.approvalTemplates({ slug: 'bob' })).toMatchObject({
      value: { effective: 'cautious', source: 'specific' },
    });
    bridge.approvalTemplateGlobalSet({ template: null });
    expect(bridge.approvalTemplates({ slug: 'bob' })).toMatchObject({
      value: { effective: 'cautious' },
    });
    bridge.botApprovalTemplateSet({ slug: 'bob', template: null });
    expect(registry.get('bob')?.approvalTemplate).toBeUndefined();
  });

  it('keeps copies independent and saving alone leaves Bot/global selections intact', () => {
    const { bridge, library, registry } = methods();
    library.setGlobal('cautious');
    registry.setApprovalTemplate('bob', '@global');
    bridge.approvalTemplateCreate({ name: 'original', text: MINE });
    bridge.approvalTemplateCreate({ name: 'copy', from: 'original' });
    bridge.approvalTemplateUpdate({ name: 'original', text: '# Changed' });
    expect(library.get('copy')?.text).toBe(MINE);
    expect(library.get('copy')).not.toHaveProperty('from');
    expect(registry.get('bob')?.approvalTemplate).toBe('@global');
    expect(library.global()).toEqual({ kind: 'selected', name: 'cautious' });
  });

  it('creates, copies, edits and lists templates with the Bots that use them', () => {
    const { bridge } = methods();
    expect(bridge.approvalTemplateCreate({ name: 'night-shift', text: MINE })).toMatchObject({
      ok: true,
      value: { template: { name: 'night-shift', builtIn: false, usedBy: ['ada'] } },
    });
    const copied = bridge.approvalTemplateCreate({ name: 'my-cautious', from: 'cautious' });
    expect(copied).toMatchObject({ ok: true, value: { template: { title: 'Cautious' } } });
    expect(bridge.approvalTemplateUpdate({ name: 'my-cautious', text: MINE })).toMatchObject({
      ok: true,
      value: { template: { title: 'Night shift', usedBy: [] } },
    });
    const listed = bridge.approvalTemplates({});
    expect(listed.ok && listed.value.templates.map((t) => [t.name, t.builtIn, t.usedBy])).toEqual([
      ['cautious', true, []],
      ['get-work-done', true, []],
      ['my-cautious', false, []],
      ['night-shift', false, ['ada']],
    ]);
    expect(bridge.botApprovalTemplateSet({ slug: 'bob', template: 'missing' })).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    });
  });

  it('clears the selection of every Bot that used a deleted template', () => {
    const { bridge, registry } = methods();
    bridge.approvalTemplateCreate({ name: 'night-shift', text: MINE });
    expect(bridge.approvalTemplateDelete({ name: 'night-shift' })).toEqual({
      ok: true,
      value: { template: { name: 'night-shift' }, clearedBots: ['ada'] },
    });
    expect(registry.get('ada')?.approvalTemplate).toBeUndefined();
  });

  it('refuses with codes', () => {
    const { bridge } = methods();
    bridge.approvalTemplateCreate({ name: 'night-shift', text: MINE });
    const code = (result: { ok: boolean; error?: { code: string } }) => result.error?.code;
    expect(code(bridge.approvalTemplateCreate({ name: 'night-shift', text: MINE }))).toBe(
      'template-exists',
    );
    expect(code(bridge.approvalTemplateUpdate({ name: 'cautious', text: MINE }))).toBe(
      'template-read-only',
    );
    expect(code(bridge.approvalTemplateDelete({ name: 'nope' }))).toBe('unknown-template');
    expect(code(bridge.approvalTemplateCreate({ name: 'x', from: 'nope' }))).toBe(
      'unknown-template',
    );
    expect(code(bridge.approvalTemplateCreate({ name: 'Bad', text: MINE }))).toBe('invalid-input');
    expect(code(bridge.approvalTemplateCreate({ name: 'y', text: MINE, from: 'cautious' }))).toBe(
      'invalid-input',
    );
  });
});

describe('deepseekbot approval-template', () => {
  async function host() {
    const calls: { method: string; args: unknown }[] = [];
    const server = createServer(async (req, res) => {
      const url = new URL(req.url!, 'http://localhost');
      if (req.method === 'GET' && url.searchParams.has('token')) {
        res.setHeader('set-cookie', 'authority=signed; HttpOnly');
        res.writeHead(302, { location: '/' }).end();
        return;
      }
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk);
      const envelope = JSON.parse(Buffer.concat(chunks).toString()) as {
        method: string;
        rpcId: string;
        payload: { args: unknown };
      };
      const method = envelope.method.replace('botharness/', '');
      calls.push({ method, args: envelope.payload.args });
      const value =
        method === 'approvalTemplates'
          ? {
              templates: [
                {
                  name: 'night-shift',
                  title: 'Night shift',
                  builtIn: false,
                  usedBy: [],
                  text: MINE,
                },
              ],
            }
          : { echo: envelope.payload.args };
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          type: 'server-response',
          rpcId: envelope.rpcId,
          result: { ok: true, value },
        }),
      );
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('missing address');
    return { url: `http://127.0.0.1:${address.port}`, calls };
  }

  async function invoke(argv: string[], url: string, stdin = '') {
    const stdout: string[] = [];
    const code = await runBotCreateCli(argv, {
      env: { DEEPSEEKBOT_HOST: url, DEEPSEEKBOT_HOST_TOKEN: 'private-test-token' },
      stdout: (text) => stdout.push(text),
      stderr: () => {},
      readStdin: async () => stdin,
    });
    return { code, json: JSON.parse(stdout.join('')) as Record<string, unknown> };
  }

  it('lists, shows, creates, copies, edits and deletes through the Host', async () => {
    const live = await host();
    const draft = join(tempDir(), 'draft.md');
    writeFileSync(draft, MINE);
    expect((await invoke(['approval-template', 'list'], live.url)).json).toEqual({
      templates: [{ name: 'night-shift', title: 'Night shift', builtIn: false, usedBy: [] }],
    });
    expect((await invoke(['approval-template', 'show', 'night-shift'], live.url)).json).toEqual({
      template: {
        name: 'night-shift',
        title: 'Night shift',
        builtIn: false,
        usedBy: [],
        text: MINE,
      },
    });
    await invoke(['approval-template', 'create', 'night-shift', '--file', draft], live.url);
    await invoke(['approval-template', 'create', 'mine', '--from', 'cautious'], live.url);
    await invoke(['approval-template', 'edit', 'mine', '--text-stdin'], live.url, MINE);
    await invoke(['approval-template', 'delete', 'mine'], live.url);
    await invoke(['approval-template-global-set', 'cautious'], live.url);
    await invoke(['approval-template-global-set', 'off'], live.url);
    await invoke(['approval-template-set', 'ada', 'inherit'], live.url);
    expect(live.calls.slice(2)).toEqual([
      { method: 'approvalTemplateCreate', args: { name: 'night-shift', text: MINE } },
      { method: 'approvalTemplateCreate', args: { name: 'mine', from: 'cautious' } },
      { method: 'approvalTemplateUpdate', args: { name: 'mine', text: MINE } },
      { method: 'approvalTemplateDelete', args: { name: 'mine' } },
      { method: 'approvalTemplateGlobalSet', args: { template: 'cautious' } },
      { method: 'approvalTemplateGlobalSet', args: { template: null } },
      { method: 'botApprovalTemplateSet', args: { slug: 'ada', template: '@global' } },
    ]);
  });

  it('creates a blank draft explicitly and applies only with the explicit target flag', async () => {
    const live = await host();
    await invoke(['approval-template', 'create', 'blank', '--blank'], live.url);
    expect(live.calls).toHaveLength(1);
    expect(live.calls[0]).toMatchObject({ method: 'approvalTemplateCreate' });
    const partsFile = join(tempDir(), 'parts.json');
    const parts = {
      alwaysAsk: ['Send messages'],
      alwaysAllow: ['Read files'],
      freeText: 'Ask when unsure.',
    };
    writeFileSync(partsFile, JSON.stringify(parts));
    await invoke(
      ['approval-template', 'edit', 'blank', '--parts-file', partsFile, '--apply-to', 'ada'],
      live.url,
    );
    expect(live.calls.slice(1)).toEqual([
      {
        method: 'approvalTemplateUpdate',
        args: { name: 'blank', text: encodeApprovalTemplateGuidance(parts) },
      },
      { method: 'botApprovalTemplateSet', args: { slug: 'ada', template: 'blank' } },
    ]);
    expect(
      changesApprovalPolicy(
        'deepseekbot approval-template create blank --blank --apply-to ada',
        () => false,
      ),
    ).toBe(true);
  });

  it.each([
    ['--from', 'cautious', '--blank'],
    ['--from', 'cautious', '--parts-file', 'missing-guidance.json'],
    ['--from', 'cautious', '--blank', '--apply-to', 'ada'],
    ['--from', 'cautious', '--parts-file', 'missing-guidance.json', '--apply-to', 'ada'],
    ['--from', '   ', '--apply-to', 'ada'],
  ])('refuses ambiguous or empty creation sources before save/apply: %j', async (...options) => {
    const live = await host();
    const result = await invoke(['approval-template', 'create', 'copy', ...options], live.url);
    expect(result).toMatchObject({ json: { error: { code: 'usage' } } });
    expect(result.code).not.toBe(0);
    expect(live.calls).toEqual([]);
  });

  it('selects literal reserved-looking template names without changing legacy Off or inheritance', async () => {
    const live = await host();
    for (const argv of [
      ['approval-template-global-set', 'off', '--literal-template'],
      ['approval-template-set', 'ada', 'off', '--literal-template'],
      ['approval-template-set', 'ada', 'inherit', '--literal-template'],
      ['approval-template-global-set', 'off'],
      ['approval-template-set', 'ada', 'inherit'],
    ])
      expect((await invoke(argv, live.url)).code).toBe(0);
    expect(live.calls).toEqual([
      { method: 'approvalTemplateGlobalSet', args: { template: 'off' } },
      { method: 'botApprovalTemplateSet', args: { slug: 'ada', template: 'off' } },
      { method: 'botApprovalTemplateSet', args: { slug: 'ada', template: 'inherit' } },
      { method: 'approvalTemplateGlobalSet', args: { template: null } },
      { method: 'botApprovalTemplateSet', args: { slug: 'ada', template: '@global' } },
    ]);
  });

  it('refuses bad usage before calling the Host', async () => {
    const live = await host();
    for (const argv of [
      ['approval-template'],
      ['approval-template', 'rename', 'a'],
      ['approval-template', 'create', 'mine'],
      ['approval-template', 'create', 'mine', '--from', 'cautious', '--text-stdin'],
      ['approval-template', 'edit'],
      ['approval-template', 'delete', 'a', 'b'],
      ['approval-template', 'list', '--literal-template'],
    ]) {
      const result = await invoke(argv, live.url);
      expect(result.code, argv.join(' ')).not.toBe(0);
      expect(result.json).toMatchObject({ error: { code: 'usage' } });
    }
    expect(live.calls).toEqual([]);
  });
});
