import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { runBotCreateCli } from '../src/bots/bot-create-cli.js';
import type { PersonaBotRecord } from '../src/bots/persona-bot.js';
import { createBridgeMethods, type BridgeMethodsDeps } from '../src/bridge/methods.js';
import {
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
  const bots = records.map((record) => ({ ...record }) as PersonaBotRecord);
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

  it('turns a Shell edit of a template a Bot uses into a Human approval', () => {
    const registry = fakeRegistry([{ slug: 'ada', approvalTemplate: 'night-shift' }]);
    const templateInUse = approvalTemplateInUse(registry);
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
    const library = createApprovalTemplateLibrary(join(tempDir(), 'approval-templates'));
    return {
      registry,
      library,
      bridge: createBridgeMethods({
        registry,
        approvalTemplates: library,
      } as unknown as BridgeMethodsDeps),
    };
  }

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
    expect(live.calls.slice(2)).toEqual([
      { method: 'approvalTemplateCreate', args: { name: 'night-shift', text: MINE } },
      { method: 'approvalTemplateCreate', args: { name: 'mine', from: 'cautious' } },
      { method: 'approvalTemplateUpdate', args: { name: 'mine', text: MINE } },
      { method: 'approvalTemplateDelete', args: { name: 'mine' } },
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
    ]) {
      const result = await invoke(argv, live.url);
      expect(result.code, argv.join(' ')).not.toBe(0);
      expect(result.json).toMatchObject({ error: { code: 'usage' } });
    }
    expect(live.calls).toEqual([]);
  });
});
