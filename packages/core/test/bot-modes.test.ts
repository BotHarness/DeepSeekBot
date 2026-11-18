import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { runBotModeCommand } from '../src/bots/cli-bot-modes.js';
import type { PersonaBotRecord } from '../src/bots/persona-bot.js';
import type { PersonaBotRegistry } from '../src/bots/registry.js';
import { createBotModeBridgeMethods } from '../src/bridge/bot-modes.js';
import {
  BOT_MODE_SETTINGS_FILE,
  createBotModeSettings,
  type BotModeOption,
} from '../src/runtime/bot-mode-settings.js';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function dir(): string {
  const path = mkdtempSync(join(tmpdir(), 'bot-modes-'));
  dirs.push(path);
  return path;
}

const ROSTER: BotModeOption[] = [
  { id: 'standard', name: '标准模式' },
  { id: 'ptc', name: 'PTC 模式' },
  { id: 'deepseekbot', name: 'Tobs' },
  { id: 'acp', name: 'NTR 模式' },
  { id: 'broken', name: 'Broken', broken: 'import failed' },
];

function registry(bots: Record<string, Partial<PersonaBotRecord>>): PersonaBotRegistry {
  return {
    get: (slug: string) =>
      bots[slug] === undefined ? undefined : ({ slug, ...bots[slug] } as PersonaBotRecord),
    update: (slug: string, patch: { preset?: string }) => {
      const bot = bots[slug];
      if (bot === undefined) return { ok: false, reason: 'not-found' };
      if (patch.preset !== undefined) {
        if (patch.preset === '') delete bot.preset;
        else bot.preset = patch.preset;
      }
      return { ok: true, record: { slug, ...bot } };
    },
  } as unknown as PersonaBotRegistry;
}

describe('Bot mode settings', () => {
  it('stores the global default and returns to the product default when cleared', () => {
    const home = dir();
    const settings = createBotModeSettings(home);
    expect(settings.defaultMode()).toBeUndefined();
    settings.setDefaultMode('ptc');
    expect(createBotModeSettings(home).defaultMode()).toBe('ptc');
    expect(JSON.parse(readFileSync(join(home, BOT_MODE_SETTINGS_FILE), 'utf8'))).toEqual({
      defaultMode: 'ptc',
    });
    settings.setDefaultMode(undefined);
    expect(createBotModeSettings(home).defaultMode()).toBeUndefined();
  });

  it('falls back to the product default when the file cannot be read', () => {
    const home = dir();
    writeFileSync(join(home, BOT_MODE_SETTINGS_FILE), '{"defaultMode": 3}');
    expect(createBotModeSettings(home).defaultMode()).toBeUndefined();
  });
});

describe('Bot mode bridge methods', () => {
  const setup = () => {
    const bots: Record<string, Partial<PersonaBotRecord>> = { ada: {}, bob: { preset: 'ptc' } };
    const methods = createBotModeBridgeMethods({
      modes: {
        settings: createBotModeSettings(dir()),
        productDefault: 'deepseekbot',
        roster: async () => ROSTER,
      },
      registry: registry(bots),
    });
    return { bots, methods };
  };

  it('lists every installed mode with the product, global and Bot choices', async () => {
    const { methods } = setup();
    expect(await methods.botModes({ slug: 'bob' })).toEqual({
      ok: true,
      value: {
        modes: ROSTER,
        productDefault: 'deepseekbot',
        globalDefault: null,
        effectiveDefault: 'deepseekbot',
        bot: { slug: 'bob', mode: 'ptc', effective: 'ptc' },
      },
    });
  });

  it('lets a Bot without its own mode follow the global default', async () => {
    const { methods } = setup();
    expect(await methods.botModeDefaultSet({ mode: 'standard' })).toMatchObject({
      ok: true,
      value: { globalDefault: 'standard', effectiveDefault: 'standard' },
    });
    expect(await methods.botModes({ slug: 'ada' })).toMatchObject({
      ok: true,
      value: { bot: { slug: 'ada', mode: null, effective: 'standard' } },
    });
    expect(await methods.botModeDefaultSet({ mode: null })).toMatchObject({
      ok: true,
      value: { globalDefault: null, effectiveDefault: 'deepseekbot' },
    });
  });

  it('sets and clears one Bot’s own mode', async () => {
    const { bots, methods } = setup();
    expect(await methods.botModeSet({ slug: 'ada', mode: 'acp' })).toMatchObject({
      ok: true,
      value: { bot: { slug: 'ada', mode: 'acp', effective: 'acp' } },
    });
    expect(bots['ada']?.preset).toBe('acp');
    expect(await methods.botModeSet({ slug: 'ada', mode: null })).toMatchObject({
      ok: true,
      value: { bot: { slug: 'ada', mode: null, effective: 'deepseekbot' } },
    });
    expect(bots['ada']?.preset).toBeUndefined();
  });

  it('refuses modes that are not installed or failed to load, and unknown Bots', async () => {
    const { methods } = setup();
    expect(await methods.botModeSet({ slug: 'ada', mode: 'creator' })).toMatchObject({
      ok: false,
      error: { code: 'mode-not-found' },
    });
    expect(await methods.botModeDefaultSet({ mode: 'broken' })).toMatchObject({
      ok: false,
      error: { code: 'mode-broken' },
    });
    expect(await methods.botModeSet({ slug: 'ada', mode: '../x' })).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    });
    expect(await methods.botModeSet({ slug: 'nobody', mode: 'ptc' })).toMatchObject({
      ok: false,
      error: { code: 'not-found' },
    });
  });

  it('reports the methods unavailable without the DSH mode service', async () => {
    const methods = createBotModeBridgeMethods({ modes: undefined, registry: registry({}) });
    expect(await methods.botModes({})).toMatchObject({
      ok: false,
      error: { code: 'modes-unavailable' },
    });
  });
});

describe('bot-modes CLI', () => {
  const run = async (command: string, rest: string[]) => {
    const calls: Array<[string, Record<string, unknown>]> = [];
    await runBotModeCommand(command as never, rest, async () => async (method, payload) => {
      calls.push([method, payload]);
      return {};
    });
    return calls;
  };

  it('maps each command to its bridge method', async () => {
    expect(await run('bot-modes', [])).toEqual([['botModes', {}]]);
    expect(await run('bot-modes', ['ada'])).toEqual([['botModes', { slug: 'ada' }]]);
    expect(await run('bot-mode-default-set', ['ptc'])).toEqual([
      ['botModeDefaultSet', { mode: 'ptc' }],
    ]);
    expect(await run('bot-mode-default-set', ['@product'])).toEqual([
      ['botModeDefaultSet', { mode: null }],
    ]);
    expect(await run('bot-mode-set', ['ada', 'acp'])).toEqual([
      ['botModeSet', { slug: 'ada', mode: 'acp' }],
    ]);
    expect(await run('bot-mode-set', ['ada', '@global'])).toEqual([
      ['botModeSet', { slug: 'ada', mode: null }],
    ]);
  });

  it.each([
    ['bot-modes', ['a', 'b']],
    ['bot-mode-default-set', []],
    ['bot-mode-set', ['ada']],
  ])('refuses %s %j with a usage error', async (command, rest) => {
    await expect(run(command, rest)).rejects.toMatchObject({ code: 'usage' });
  });
});
