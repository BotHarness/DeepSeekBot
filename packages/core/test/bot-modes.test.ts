import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { runBotModeCommand } from '../src/bots/cli-bot-modes.js';
import { parseBotCliArgs } from '../src/bots/cli-options.js';
import type { PersonaBotRecord } from '../src/bots/persona-bot.js';
import type { PersonaBotRegistry } from '../src/bots/registry.js';
import { createBotModeBridgeMethods } from '../src/bridge/bot-modes.js';
import {
  BOT_MODE_SETTINGS_FILE,
  createBotModeSettings,
  resolveBotMode,
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
    list: () => Object.keys(bots).map((slug) => ({ slug, ...bots[slug] }) as PersonaBotRecord),
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

  it('keeps mode templates and the template each Bot uses', () => {
    const home = dir();
    const settings = createBotModeSettings(home);
    settings.setDefaultMode('ptc');
    const coding = settings.saveTemplate({ name: ' Coding ', modes: ['ptc', 'acp', 'ptc'] });
    expect(coding).toMatchObject({ name: 'Coding', modes: ['ptc', 'acp'] });
    settings.setTemplateOf('ada', coding.id);
    const reread = createBotModeSettings(home);
    expect(reread.defaultMode()).toBe('ptc');
    expect(reread.templateOf('ada')).toBe(coding.id);
    expect(reread.allowedModes('ada')).toEqual(['ptc', 'acp']);
    expect(reread.allowedModes('bob')).toBeUndefined();
    reread.saveTemplate({ id: coding.id, name: 'Coding', modes: ['acp'] });
    expect(createBotModeSettings(home).allowedModes('ada')).toEqual(['acp']);
    reread.deleteTemplate(coding.id);
    expect(createBotModeSettings(home).templateOf('ada')).toBeUndefined();
    expect(JSON.parse(readFileSync(join(home, BOT_MODE_SETTINGS_FILE), 'utf8'))).toEqual({
      defaultMode: 'ptc',
    });
    expect(() => reread.saveTemplate({ name: '', modes: ['ptc'] })).toThrow(/name/);
    expect(() => reread.saveTemplate({ name: 'Empty', modes: [] })).toThrow(/between 1/);
    expect(() => reread.setTemplateOf('ada', 'missing')).toThrow(/unknown mode template/);
  });

  it('refuses to point a Bot at a template another instance deleted', () => {
    const home = dir();
    const first = createBotModeSettings(home);
    const coding = first.saveTemplate({ name: 'Coding', modes: ['ptc'] });
    expect(first.template(coding.id)).toBeDefined();
    createBotModeSettings(home).deleteTemplate(coding.id);
    expect(() => first.setTemplateOf('ada', coding.id)).toThrow(/unknown mode template/);
    expect(JSON.parse(readFileSync(join(home, BOT_MODE_SETTINGS_FILE), 'utf8'))).toEqual({});
  });

  it('falls back to the product default when the file cannot be read, and reports why', () => {
    const home = dir();
    writeFileSync(join(home, BOT_MODE_SETTINGS_FILE), '{"defaultMode": 3}');
    const settings = createBotModeSettings(home);
    expect(settings.defaultMode()).toBeUndefined();
    expect(settings.readError()).toMatch(/invalid defaultMode/);
    writeFileSync(join(home, BOT_MODE_SETTINGS_FILE), '{"defaultMode": "ptc"}');
    expect(settings.readError()).toBeUndefined();
    expect(settings.defaultMode()).toBe('ptc');
  });

  it('writes on top of the file as it is now, not an older read', () => {
    const home = dir();
    const first = createBotModeSettings(home);
    const second = createBotModeSettings(home);
    expect(first.defaultMode()).toBeUndefined();
    second.setDefaultMode('ptc');
    first.saveTemplate({ name: 'Coding', modes: ['ptc'] });
    expect(createBotModeSettings(home).defaultMode()).toBe('ptc');
  });

  it('keeps a Bot that follows the default inside its template', () => {
    const installed = new Set(['standard', 'ptc', 'deepseekbot']);
    const resolve = (own: string | undefined, allowed: string[] | undefined) =>
      resolveBotMode({ own, inherited: 'deepseekbot', allowed, installed });
    expect(resolve(undefined, undefined)).toBe('deepseekbot');
    expect(resolve(undefined, ['ptc', 'deepseekbot'])).toBe('deepseekbot');
    expect(resolve(undefined, ['acp', 'ptc'])).toBe('ptc');
    expect(resolve('standard', ['ptc'])).toBe('standard');
    expect(resolve(undefined, ['acp'])).toBe('acp');
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
        templates: [],
        bot: { slug: 'bob', mode: 'ptc', effective: 'ptc', template: null, allowed: null },
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

  it('limits a Bot to the modes of its template', async () => {
    const { bots, methods } = setup();
    const saved = await methods.botModeTemplateSave({ name: 'Coding', modes: ['ptc', 'acp'] });
    expect(saved).toMatchObject({ ok: true, value: { templates: [{ name: 'Coding' }] } });
    const id = saved.ok ? saved.value.templates[0]!.id : '';
    expect(await methods.botModeTemplateSet({ slug: 'ada', template: id })).toMatchObject({
      ok: true,
      value: { bot: { slug: 'ada', template: id, allowed: ['ptc', 'acp'] } },
    });
    expect(await methods.botModeSet({ slug: 'ada', mode: 'standard' })).toMatchObject({
      ok: false,
      error: { code: 'mode-not-allowed' },
    });
    expect(await methods.botModeSet({ slug: 'ada', mode: 'acp' })).toMatchObject({ ok: true });
    expect(bots['ada']?.preset).toBe('acp');
    expect(await methods.botModeTemplateSave({ id, name: 'Coding', modes: ['ptc'] })).toMatchObject(
      { ok: false, error: { code: 'mode-not-allowed' } },
    );
    expect(await methods.botModeTemplateDelete({ id })).toMatchObject({
      ok: false,
      error: { code: 'template-in-use' },
    });
    expect(await methods.botModeTemplateSet({ slug: 'ada', template: null })).toMatchObject({
      ok: true,
      value: { bot: { template: null, allowed: null } },
    });
    expect(await methods.botModeTemplateDelete({ id })).toMatchObject({
      ok: true,
      value: { templates: [] },
    });
  });

  it('refuses a template the Bot’s own mode falls outside of, and bad template input', async () => {
    const { methods } = setup();
    const saved = await methods.botModeTemplateSave({ name: 'Plain', modes: ['standard'] });
    const id = saved.ok ? saved.value.templates[0]!.id : '';
    expect(await methods.botModeTemplateSet({ slug: 'bob', template: id })).toMatchObject({
      ok: false,
      error: { code: 'mode-not-allowed' },
    });
    expect(await methods.botModeTemplateSave({ name: 'X', modes: ['creator'] })).toMatchObject({
      ok: false,
      error: { code: 'mode-not-found' },
    });
    expect(await methods.botModeTemplateSave({ name: 'X', modes: ['broken'] })).toMatchObject({
      ok: false,
      error: { code: 'mode-broken' },
    });
    expect(await methods.botModeTemplateSave({ name: '', modes: ['ptc'] })).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    });
    expect(await methods.botModeTemplateSet({ slug: 'ada', template: 'nope' })).toMatchObject({
      ok: false,
      error: { code: 'not-found' },
    });
  });

  it('reports the template-limited mode a following Bot actually uses', async () => {
    const home = dir();
    const settings = createBotModeSettings(home);
    const bots: Record<string, Partial<PersonaBotRecord>> = { ada: {} };
    const methods = createBotModeBridgeMethods({
      modes: {
        settings,
        productDefault: 'deepseekbot',
        roster: async () => ROSTER,
        modeOf: (slug) =>
          resolveBotMode({
            own: bots[slug]?.preset,
            inherited: settings.defaultMode() ?? 'deepseekbot',
            allowed: settings.allowedModes(slug),
            installed: undefined,
          }),
      },
      registry: registry(bots),
    });
    const saved = await methods.botModeTemplateSave({ name: 'Coding', modes: ['ptc', 'acp'] });
    const id = saved.ok ? saved.value.templates[0]!.id : '';
    expect(await methods.botModeTemplateSet({ slug: 'ada', template: id })).toMatchObject({
      ok: true,
      value: { bot: { mode: null, effective: 'ptc', allowed: ['ptc', 'acp'] } },
    });
    writeFileSync(join(home, BOT_MODE_SETTINGS_FILE), 'not json');
    const restarted = createBotModeBridgeMethods({
      modes: {
        settings: createBotModeSettings(home),
        productDefault: 'deepseekbot',
        roster: async () => ROSTER,
      },
      registry: registry(bots),
    });
    expect(await restarted.botModes({ slug: 'ada' })).toMatchObject({
      ok: false,
      error: { code: 'settings-unreadable' },
    });
  });

  it('never reports a mode outside the template once its modes are uninstalled', async () => {
    const settings = createBotModeSettings(dir());
    const bots: Record<string, Partial<PersonaBotRecord>> = { ada: { preset: 'acp' } };
    let installed = new Set(ROSTER.map((mode) => mode.id));
    const methods = createBotModeBridgeMethods({
      modes: {
        settings,
        productDefault: 'deepseekbot',
        roster: async () => ROSTER.filter((mode) => installed.has(mode.id)),
        modeOf: (slug) =>
          resolveBotMode({
            own: bots[slug]?.preset,
            inherited: 'deepseekbot',
            allowed: settings.allowedModes(slug),
            installed,
          }),
      },
      registry: registry(bots),
    });
    const saved = await methods.botModeTemplateSave({ name: 'ACP', modes: ['acp'] });
    const id = saved.ok ? saved.value.templates[0]!.id : '';
    await methods.botModeTemplateSet({ slug: 'ada', template: id });
    installed = new Set(['deepseekbot', 'ptc']);
    expect(await methods.botModeSet({ slug: 'ada', mode: null })).toMatchObject({
      ok: true,
      value: { bot: { mode: null, effective: 'acp', allowed: ['acp'] } },
    });
    expect(await methods.botModeTemplateSet({ slug: 'ada', template: null })).toMatchObject({
      ok: true,
      value: { bot: { effective: 'deepseekbot', allowed: null } },
    });
  });

  it('reports the default Sessions use when the saved default is uninstalled', async () => {
    const settings = createBotModeSettings(dir());
    settings.setDefaultMode('acp');
    const methods = createBotModeBridgeMethods({
      modes: {
        settings,
        productDefault: 'deepseekbot',
        roster: async () => ROSTER.filter((mode) => mode.id !== 'acp'),
      },
      registry: registry({}),
    });
    expect(await methods.botModes({})).toMatchObject({
      ok: true,
      value: { globalDefault: 'acp', effectiveDefault: 'deepseekbot' },
    });
  });

  it('refuses changes while the settings file cannot be read, except clearing a Bot’s mode', async () => {
    const home = dir();
    writeFileSync(join(home, BOT_MODE_SETTINGS_FILE), 'not json');
    const bots: Record<string, Partial<PersonaBotRecord>> = { ada: { preset: 'ptc' } };
    const methods = createBotModeBridgeMethods({
      modes: {
        settings: createBotModeSettings(home),
        productDefault: 'deepseekbot',
        roster: async () => ROSTER,
      },
      registry: registry(bots),
    });
    const refused = { ok: false, error: { code: 'settings-unreadable' } };
    expect(await methods.botModeSet({ slug: 'ada', mode: 'acp' })).toMatchObject(refused);
    expect(await methods.botModeDefaultSet({ mode: 'ptc' })).toMatchObject(refused);
    expect(await methods.botModeTemplateSave({ name: 'Coding', modes: ['ptc'] })).toMatchObject(
      refused,
    );
    expect(await methods.botModeTemplateSet({ slug: 'ada', template: null })).toMatchObject(
      refused,
    );
    expect(bots['ada']!.preset).toBe('ptc');
    expect(await methods.botModeSet({ slug: 'ada', mode: null })).toMatchObject({ ok: true });
    expect(bots['ada']!.preset).toBeUndefined();
  });

  it('checks every Bot that uses a template, not only the caller’s own', async () => {
    const settings = createBotModeSettings(dir());
    const bots: Record<string, Partial<PersonaBotRecord>> = { ada: {} };
    const others: Record<string, Partial<PersonaBotRecord>> = { ...bots, max: { preset: 'ptc' } };
    const methods = createBotModeBridgeMethods({
      modes: { settings, productDefault: 'deepseekbot', roster: async () => ROSTER },
      registry: registry(bots),
      everyone: registry(others),
    });
    const saved = await methods.botModeTemplateSave({ name: 'Coding', modes: ['ptc', 'acp'] });
    const id = saved.ok ? saved.value.templates[0]!.id : '';
    settings.setTemplateOf('max', id);
    expect(await methods.botModeTemplateSave({ id, name: 'Coding', modes: ['acp'] })).toMatchObject(
      { ok: false, error: { code: 'mode-not-allowed', message: /max/ } },
    );
    expect(await methods.botModeTemplateDelete({ id })).toMatchObject({
      ok: false,
      error: { code: 'template-in-use', message: /max/ },
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
  const run = async (command: string, argv: string[]) => {
    const calls: Array<[string, Record<string, unknown>]> = [];
    const { values, positionals } = parseBotCliArgs([command, ...argv]);
    await runBotModeCommand(
      command as never,
      positionals.slice(1),
      async () => async (method, payload) => {
        calls.push([method, payload]);
        return {};
      },
      values.id === undefined ? {} : { id: values.id },
    );
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
    expect(await run('bot-mode-template-save', ['Coding', 'ptc', 'acp'])).toEqual([
      ['botModeTemplateSave', { name: 'Coding', modes: ['ptc', 'acp'] }],
    ]);
    expect(await run('bot-mode-template-save', ['--id', 't1', 'Coding', 'ptc'])).toEqual([
      ['botModeTemplateSave', { id: 't1', name: 'Coding', modes: ['ptc'] }],
    ]);
    expect(await run('bot-mode-template-delete', ['t1'])).toEqual([
      ['botModeTemplateDelete', { id: 't1' }],
    ]);
    expect(await run('bot-mode-template-set', ['ada', 't1'])).toEqual([
      ['botModeTemplateSet', { slug: 'ada', template: 't1' }],
    ]);
    expect(await run('bot-mode-template-set', ['ada', '@all'])).toEqual([
      ['botModeTemplateSet', { slug: 'ada', template: null }],
    ]);
  });

  it.each([
    ['bot-modes', ['a', 'b']],
    ['bot-mode-default-set', []],
    ['bot-mode-set', ['ada']],
    ['bot-mode-template-save', ['Coding']],
    ['bot-mode-template-save', ['--id', ' ', 'Coding', 'ptc']],
    ['bot-mode-template-delete', []],
    ['bot-mode-template-delete', ['t1', '--id', 't2']],
    ['bot-mode-template-set', ['ada']],
  ])('refuses %s %j with a usage error', async (command, rest) => {
    await expect(run(command, rest)).rejects.toMatchObject({ code: 'usage' });
  });
});
