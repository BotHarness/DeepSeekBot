import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import {
  DEFAULT_PROMPT_TEXT,
  PROMPT_PARTS,
  defaultPromptText,
  promptTextHash,
} from '../src/prompts/prompt-parts.js';
import {
  applyPromptPartEdits,
  createPromptPresetLibrary,
  parsePromptPartEdits,
  resolvePromptParts,
  type PromptPreset,
} from '../src/prompts/prompt-presets.js';
import { createPromptSettings } from '../src/prompts/prompt-settings.js';
import { createSessionOwnership } from '../src/sessions/ownership.js';
import { createTempRoot } from './helpers.js';

const AT = '2026-10-26T00:00:00.000Z';

function preset(parts: PromptPreset['parts'], id = 'p1'): PromptPreset {
  return { id, name: id, revision: 1, parts, updatedAt: AT };
}

function override(text: string, id: (typeof PROMPT_PARTS)[number]['id']) {
  return { text, base: promptTextHash(defaultPromptText(id)) };
}

describe('Prompt Preset parts', () => {
  it('keeps unique ids and nonblank defaults', () => {
    const ids = PROMPT_PARTS.map((part) => part.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const part of PROMPT_PARTS) expect(part.defaultText.trim()).not.toBe('');
    expect(DEFAULT_PROMPT_TEXT('triage')).toBe(defaultPromptText('triage'));
  });

  it('rejects unknown parts, blank text and oversized text', () => {
    expect(parsePromptPartEdits({ triage: 'x', attention: null })).toEqual({
      triage: 'x',
      attention: null,
    });
    expect(parsePromptPartEdits({ nope: 'x' })).toBeUndefined();
    expect(parsePromptPartEdits({ triage: '  ' })).toBeUndefined();
    expect(parsePromptPartEdits({ triage: 'x'.repeat(8001) })).toBeUndefined();
    expect(parsePromptPartEdits([])).toBeUndefined();
  });

  it('drops an edit equal to the default or null and records the default it was based on', () => {
    const edited = applyPromptPartEdits({}, { triage: 'Close what is done.' });
    expect(edited).toEqual({ triage: override('Close what is done.', 'triage') });
    expect(applyPromptPartEdits(edited, { triage: null })).toEqual({});
    expect(applyPromptPartEdits(edited, { triage: defaultPromptText('triage') })).toEqual({});
  });
});

describe('Prompt Preset resolution', () => {
  it('takes each part from the Bot, then its preset, then the global preset, then built-in', () => {
    const parts = resolvePromptParts({
      global: preset({
        triage: override('global triage', 'triage'),
        attention: override('g', 'attention'),
      }),
      preset: preset({ attention: override('preset attention', 'attention') }, 'p2'),
      bot: { silence: override('bot silence', 'silence') },
    });
    const byId = new Map(parts.map((part) => [part.id, part]));
    expect(byId.get('triage')).toMatchObject({ text: 'global triage', source: 'global' });
    expect(byId.get('attention')).toMatchObject({ text: 'preset attention', source: 'preset' });
    expect(byId.get('silence')).toMatchObject({ text: 'bot silence', source: 'bot' });
    expect(byId.get('coordination')).toMatchObject({ source: 'built-in', defaultChanged: false });
  });

  it('flags an edited part whose built-in default changed since the edit', () => {
    const [part] = resolvePromptParts({
      bot: { coordination: { text: 'mine', base: 'old-default-hash' } },
    });
    expect(part).toMatchObject({ id: 'coordination', text: 'mine', defaultChanged: true });
  });
});

describe('Prompt Preset library', () => {
  it('creates, updates with a revision check, and deletes presets', () => {
    const dir = createTempRoot('botharness-prompt-presets-');
    const library = createPromptPresetLibrary(dir, () => new Date(AT));
    const created = library.create({ name: 'Quiet', parts: { triage: 'Close it.' } });
    if (!created.ok) throw new Error(created.reason);
    expect(library.create({ name: 'Quiet' })).toEqual({ ok: false, reason: 'duplicate-name' });
    expect(library.create({ name: ' ' })).toEqual({ ok: false, reason: 'invalid-input' });

    const id = created.value.id;
    expect(library.update(id, { name: 'Calm', expectedRevision: 2 })).toEqual({
      ok: false,
      reason: 'stale-revision',
    });
    const updated = library.update(id, {
      name: 'Calm',
      parts: { triage: null },
      expectedRevision: 1,
    });
    expect(updated).toMatchObject({ ok: true, value: { name: 'Calm', revision: 2, parts: {} } });
    expect(
      createPromptPresetLibrary(dir)
        .list()
        .map((entry) => entry.name),
    ).toEqual(['Calm']);

    expect(library.setGlobalPresetId(id)).toEqual({ ok: true, value: { presetId: id } });
    expect(library.globalPresetId()).toBe(id);
    expect(library.delete(id)).toEqual({ ok: true, value: { id } });
    expect(library.globalPresetId()).toBeUndefined();
    expect(existsSync(join(dir, 'presets', `${id}.json`))).toBe(false);
    expect(library.setGlobalPresetId('missing')).toEqual({ ok: false, reason: 'not-found' });
  });

  it('is empty and refuses writes without a directory', () => {
    const library = createPromptPresetLibrary(undefined);
    expect(library.list()).toEqual([]);
    expect(library.create({ name: 'x' })).toEqual({ ok: false, reason: 'unavailable' });
  });
});

describe('Prompt settings per Session', () => {
  function setup() {
    const home = createTempRoot('botharness-prompt-settings-');
    const owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
    const ownership = createSessionOwnership(attachOperationalModule(owner, 'session-ownership'));
    const library = createPromptPresetLibrary(join(home, 'prompt-presets'));
    const bots: Record<string, { promptPreset?: string; promptOverrides?: PromptPreset['parts'] }> =
      {
        ada: {},
      };
    const settings = createPromptSettings({
      library,
      registry: { get: (slug: string) => bots[slug] as never },
      ownership,
    });
    ownership.claim({ sessionId: 's1', botSlug: 'ada', rootRole: 'orchestrator', at: AT });
    return { owner, ownership, library, bots, settings };
  }

  it('freezes the texts a Session started with until compaction refreshes them', () => {
    const { owner, bots, settings } = setup();
    bots['ada'] = { promptOverrides: { triage: override('first', 'triage') } };
    expect(settings.textForSession('s1')('triage')).toBe('first');
    expect(settings.pending('ada', 's1')).toBe(false);

    bots['ada'] = { promptOverrides: { triage: override('second', 'triage') } };
    expect(settings.textForSession('s1')('triage')).toBe('first');
    expect(settings.pending('ada', 's1')).toBe(true);

    expect(settings.refreshAfterCompaction('s1')).toEqual({ refreshed: true });
    expect(settings.textForSession('s1')('triage')).toBe('second');
    expect(settings.pending('ada', 's1')).toBe(false);
    expect(settings.refreshAfterCompaction('s1')).toEqual({ refreshed: false });
    owner.close();
  });

  it('inherits the global preset and uses built-in text for unknown Sessions', () => {
    const { owner, library, settings } = setup();
    const created = library.create({ name: 'Global', parts: { attention: 'Global attention.' } });
    if (!created.ok) throw new Error(created.reason);
    library.setGlobalPresetId(created.value.id);
    expect(settings.resolved('ada').find((part) => part.id === 'attention')).toMatchObject({
      source: 'global',
      text: 'Global attention.',
    });
    expect(settings.textForSession('s1')('attention')).toBe('Global attention.');
    expect(settings.textForSession('unknown')('attention')).toBe(defaultPromptText('attention'));
    owner.close();
  });
});
