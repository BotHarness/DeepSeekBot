import sharp from 'sharp';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseAgentManagement, TOB_AGENT_COMMAND_USAGE } from '../src/bots/cli-agent-management.js';

const fingerprint = 'a'.repeat(64);
const directories: string[] = [];
afterEach(() => {
  for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true });
});
function parser(stdin = '') {
  const readStdin = vi.fn(async () => stdin);
  const stdout = vi.fn();
  const stderr = vi.fn();
  const parse = (command: string, rest: string[] = [], values: Record<string, unknown> = {}) =>
    parseAgentManagement(command, rest, values, { env: {}, stdout, stderr, readStdin });
  return { parse, readStdin, stdout, stderr };
}

describe('scoped Bot CLI parsing', () => {
  it('reuses blank creation syntax and binds a stable operation key', async () => {
    const { parse, readStdin, stdout, stderr } = parser('  Be concise.\n');
    expect(
      await parse('create', [], {
        name: ' Helper ',
        'operation-key': 'create-helper-1',
        description: 'Research',
        role: [' science '],
        'persona-stdin': true,
        'core-memory': 'Human prefers citations.',
      }),
    ).toEqual({
      command: 'create',
      write: true,
      args: {
        displayName: 'Helper',
        operationKey: 'create-helper-1',
        description: 'Research',
        roles: ['science'],
        persona: 'Be concise.',
        coreMemory: 'Human prefers citations.',
      },
    });
    expect(readStdin).toHaveBeenCalledOnce();
    expect(stdout).not.toHaveBeenCalled();
    expect(stderr).not.toHaveBeenCalled();
  });

  it('requires operation identity before consuming creation input', async () => {
    const { parse, readStdin } = parser('private');
    await expect(
      parse('create', [], { name: 'Helper', 'persona-stdin': true }),
    ).rejects.toMatchObject({ code: 'usage' });
    expect(readStdin).not.toHaveBeenCalled();
    await expect(
      parse('create', ['unexpected'], { name: 'Helper', 'operation-key': 'create-key-1' }),
    ).rejects.toMatchObject({ code: 'usage' });
    await expect(
      parse('create', [], {
        name: 'Helper',
        'operation-key': 'create-key-1',
        'persona-stdin': true,
        'core-memory-stdin': true,
      }),
    ).rejects.toMatchObject({ code: 'usage' });
  });

  it.each([
    'host',
    'home',
    'session',
    'bot',
    'unsafe',
    'from-git',
    'from-zip',
    'memory-location',
    'preset',
    'provider-api-key',
  ])('refuses --%s before reading files or stdin', async (key) => {
    const { parse, readStdin } = parser('private');
    await expect(
      parse('create', [], {
        name: 'Helper',
        'operation-key': 'create-key-1',
        'persona-stdin': true,
        [key]: 'private',
      }),
    ).rejects.toMatchObject({ code: 'agent-scope-denied' });
    expect(readStdin).not.toHaveBeenCalled();
  });

  it.each(['show', 'bot-delete-preview', 'bot-delete-memory-folder'])(
    'classifies %s as a targeted read',
    async (command) => {
      const { parse, readStdin } = parser();
      expect(await parse(command, ['helper'])).toEqual({
        command,
        args: { slug: 'helper' },
        write: false,
      });
      await expect(parse(command, [])).rejects.toMatchObject({ code: 'usage' });
      expect(readStdin).not.toHaveBeenCalled();
      expect(TOB_AGENT_COMMAND_USAGE[command]).toContain(command);
    },
  );

  it('carries observed fingerprint and normalized profile edits', async () => {
    const { parse } = parser();
    expect(
      await parse('update', ['helper'], {
        'expected-profile': fingerprint,
        name: ' Updated ',
        description: ' Bio ',
        role: ['one', 'two'],
      }),
    ).toEqual({
      command: 'update',
      write: true,
      args: {
        slug: 'helper',
        expectedProfile: fingerprint,
        patch: { displayName: 'Updated', description: 'Bio', roles: ['one', 'two'] },
      },
    });
    await expect(parse('update', ['helper'], { name: 'Changed' })).rejects.toMatchObject({
      code: 'usage',
    });
    await expect(
      parse('update', ['helper'], { 'expected-profile': fingerprint }),
    ).rejects.toMatchObject({ code: 'usage' });
    await expect(
      parse('update', ['helper'], {
        'expected-profile': fingerprint,
        description: 'x'.repeat(161),
      }),
    ).rejects.toMatchObject({ code: 'usage' });
    await expect(
      parse('update', ['helper'], { 'expected-profile': fingerprint, role: ['x'.repeat(33)] }),
    ).rejects.toMatchObject({ code: 'usage' });
  });

  it.each(['pause', 'resume'])('requires observed profile for %s', async (command) => {
    const { parse } = parser();
    await expect(parse(command, ['helper'])).rejects.toMatchObject({ code: 'usage' });
    expect(await parse(command, ['helper'], { 'expected-profile': fingerprint })).toEqual({
      command,
      write: true,
      args: { slug: 'helper', expectedProfile: fingerprint },
    });
  });

  it('uses the Human presentation parser for recipes, colors and clear', async () => {
    const recipe = { version: 1, parts: [] };
    const { parse } = parser(JSON.stringify(recipe));
    expect(
      await parse('bot-appearance-set', ['helper'], {
        'expected-profile': fingerprint,
        'recipe-stdin': true,
      }),
    ).toEqual({
      command: 'bot-appearance-set',
      write: true,
      args: { slug: 'helper', expectedProfile: fingerprint, recipe },
    });
    expect(
      await parse('bot-banner-set', ['helper'], {
        'expected-profile': fingerprint,
        'recipe-stdin': true,
      }),
    ).toMatchObject({ args: { banner: { recipe } } });
    expect(
      await parse('bot-avatar-set', ['helper'], { 'expected-profile': fingerprint, clear: true }),
    ).toMatchObject({ args: { avatar: null } });
    expect(
      await parse('bot-primary-color-set', ['helper'], {
        'expected-profile': fingerprint,
        color: '#AA00FF',
      }),
    ).toMatchObject({ args: { primaryColor: { mode: 'custom', color: '#aa00ff' } } });
    expect(
      await parse('bot-primary-color-set', ['helper'], {
        'expected-profile': fingerprint,
        automatic: true,
      }),
    ).toMatchObject({ args: { primaryColor: { mode: 'automatic' } } });
    await expect(
      parse('bot-avatar-set', ['helper'], {
        'expected-profile': fingerprint,
        clear: true,
        file: 'private',
      }),
    ).rejects.toMatchObject({ code: 'usage' });
    await expect(
      parse('bot-primary-color-set', ['helper'], { 'expected-profile': fingerprint, color: 'bad' }),
    ).rejects.toMatchObject({ code: 'usage' });
  });

  it('reads avatar file through the existing Human image parser', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'scoped-avatar-'));
    directories.push(dir);
    const file = join(dir, 'avatar.png');
    const bytes = await sharp({
      create: { width: 1600, height: 800, channels: 3, background: '#3388aa' },
    })
      .png()
      .toBuffer();
    writeFileSync(file, bytes);
    const { parse } = parser();
    expect(
      await parse('bot-avatar-set', ['helper'], { 'expected-profile': fingerprint, file }),
    ).toEqual({
      command: 'bot-avatar-set',
      write: true,
      args: {
        slug: 'helper',
        expectedProfile: fingerprint,
        avatar: expect.stringMatching(/^data:image\/webp;base64,/u),
      },
    });
  });

  it('retains memory unless explicit deletion choice is reviewed', async () => {
    const { parse, readStdin } = parser('{"token":"preview-token"}');
    await expect(
      parse('bot-delete-confirm', ['helper'], { 'confirmation-stdin': true }),
    ).rejects.toMatchObject({ code: 'usage' });
    expect(readStdin).not.toHaveBeenCalled();
    expect(
      await parse('bot-delete-confirm', ['helper'], { 'confirmation-stdin': true, confirm: true }),
    ).toEqual({
      command: 'bot-delete-confirm',
      write: true,
      args: { slug: 'helper', token: 'preview-token', confirm: true, eraseMemory: false },
    });
    expect(
      await parse('bot-delete-confirm', ['helper'], {
        'confirmation-stdin': true,
        confirm: true,
        'erase-memory': true,
      }),
    ).toMatchObject({ args: { eraseMemory: true } });
    expect(await parse('bot-delete-retry', ['helper'], { confirm: true })).toEqual({
      command: 'bot-delete-retry',
      write: true,
      args: { slug: 'helper', confirm: true },
    });
    await expect(
      parse('bot-delete-retry', ['helper'], { confirm: true, 'erase-memory': true }),
    ).rejects.toMatchObject({ code: 'agent-scope-denied' });
  });

  it.each(['not json', '{}', '{"token":"ok","path":"/private"}', '{"token":false}'])(
    'rejects malformed deletion confirmation without reflecting content',
    async (stdin) => {
      const { parse } = parser(stdin);
      await expect(
        parse('bot-delete-confirm', ['helper'], { confirm: true, 'confirmation-stdin': true }),
      ).rejects.toMatchObject({ code: 'usage' });
    },
  );
});
