import { randomUUID } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  PROMPT_PART_TEXT_LIMIT,
  PROMPT_PARTS,
  defaultPromptText,
  isPromptPartId,
  promptTextHash,
  type PromptPartId,
  type PromptPartTexts,
} from './prompt-parts.js';
import {
  DEFAULT_PROMPT_LIMITS,
  PROMPT_LIMITS,
  applyPromptLimitEdits,
  parsePromptLimitValues,
  type PromptLimitEdits,
  type PromptLimitId,
  type PromptLimitValues,
  type PromptLimits,
} from './prompt-limits.js';

export interface PromptPartOverride {
  text: string;
  base: string;
}

export type PromptPartOverrides = Partial<Record<PromptPartId, PromptPartOverride>>;

export interface PromptPreset {
  id: string;
  name: string;
  revision: number;
  parts: PromptPartOverrides;
  limits: PromptLimitValues;
  updatedAt: string;
}

export type PromptPartSource = 'built-in' | 'global' | 'preset' | 'bot';

export interface ResolvedPromptPart {
  id: PromptPartId;
  kind: 'system' | 'turn';
  section: string;
  text: string;
  source: PromptPartSource;
  defaultText: string;
  defaultChanged: boolean;
}

export type PromptPresetFailure =
  | 'invalid-input'
  | 'not-found'
  | 'stale-revision'
  | 'duplicate-name'
  | 'unavailable';

export type PromptPresetResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: PromptPresetFailure };

export type PromptPartEdits = Partial<Record<PromptPartId, string | null>>;

export interface PromptPresetLibrary {
  list(): PromptPreset[];
  get(id: string): PromptPreset | undefined;
  create(input: {
    name: string;
    parts?: PromptPartEdits;
    limits?: PromptLimitEdits;
  }): PromptPresetResult<PromptPreset>;
  update(
    id: string,
    input: {
      name?: string;
      parts?: PromptPartEdits;
      limits?: PromptLimitEdits;
      expectedRevision?: number;
    },
  ): PromptPresetResult<PromptPreset>;
  delete(id: string): PromptPresetResult<{ id: string }>;
  globalPresetId(): string | undefined;
  setGlobalPresetId(id: string | undefined): PromptPresetResult<{ presetId: string | null }>;
}

const NAME_LIMIT = 80;
const PRESET_ID = /^[a-z0-9-]{1,64}$/u;

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function parsePromptPartEdits(value: unknown): PromptPartEdits | undefined {
  const source = object(value);
  if (source === undefined) return undefined;
  const edits: PromptPartEdits = {};
  for (const [id, text] of Object.entries(source)) {
    if (!isPromptPartId(id)) return undefined;
    if (text === null) edits[id] = null;
    else if (
      typeof text === 'string' &&
      text.trim() !== '' &&
      text.length <= PROMPT_PART_TEXT_LIMIT
    )
      edits[id] = text;
    else return undefined;
  }
  return edits;
}

export function applyPromptPartEdits(
  current: PromptPartOverrides,
  edits: PromptPartEdits,
): PromptPartOverrides {
  const next: PromptPartOverrides = { ...current };
  for (const [id, text] of Object.entries(edits) as Array<[PromptPartId, string | null]>) {
    if (text === null) delete next[id];
    else if (current[id]?.text !== text)
      next[id] = { text, base: promptTextHash(defaultPromptText(id)) };
  }
  return next;
}

export function parsePromptPartOverrides(value: unknown): PromptPartOverrides | undefined {
  const source = object(value);
  if (source === undefined) return undefined;
  const parts: PromptPartOverrides = {};
  for (const [id, entry] of Object.entries(source)) {
    const override = object(entry);
    if (
      !isPromptPartId(id) ||
      typeof override?.['text'] !== 'string' ||
      typeof override['base'] !== 'string'
    )
      continue;
    parts[id] = { text: override['text'], base: override['base'] };
  }
  return parts;
}

function parsePreset(value: unknown): PromptPreset | undefined {
  const source = object(value);
  if (
    source === undefined ||
    typeof source['id'] !== 'string' ||
    !PRESET_ID.test(source['id']) ||
    typeof source['name'] !== 'string' ||
    typeof source['revision'] !== 'number' ||
    typeof source['updatedAt'] !== 'string'
  )
    return undefined;
  return {
    id: source['id'],
    name: source['name'],
    revision: source['revision'],
    parts: parsePromptPartOverrides(source['parts']) ?? {},
    limits: parsePromptLimitValues(source['limits']),
    updatedAt: source['updatedAt'],
  };
}

export function resolvePromptParts(layers: {
  global?: PromptPreset | undefined;
  preset?: PromptPreset | undefined;
  bot?: PromptPartOverrides | undefined;
}): ResolvedPromptPart[] {
  return PROMPT_PARTS.map((part) => {
    const candidates: Array<[PromptPartSource, PromptPartOverride | undefined]> = [
      ['bot', layers.bot?.[part.id]],
      ['preset', layers.preset?.parts[part.id]],
      ['global', layers.global?.parts[part.id]],
    ];
    const found = candidates.find(([, override]) => override !== undefined);
    const override = found?.[1];
    return {
      id: part.id,
      kind: part.kind,
      section: part.section,
      text: override?.text ?? part.defaultText,
      source: found?.[0] ?? 'built-in',
      defaultText: part.defaultText,
      defaultChanged: override !== undefined && override.base !== promptTextHash(part.defaultText),
    };
  });
}

export interface ResolvedPromptLimit {
  id: PromptLimitId;
  group: 'inbox' | 'review';
  value: number;
  source: PromptPartSource;
  defaultValue: number;
  min: number;
  max: number;
}

export function resolvePromptLimits(layers: {
  global?: PromptPreset | undefined;
  preset?: PromptPreset | undefined;
  bot?: PromptLimitValues | undefined;
}): ResolvedPromptLimit[] {
  return PROMPT_LIMITS.map((limit) => {
    const candidates: Array<[PromptPartSource, number | undefined]> = [
      ['bot', layers.bot?.[limit.id]],
      ['preset', layers.preset?.limits[limit.id]],
      ['global', layers.global?.limits[limit.id]],
    ];
    const found = candidates.find(([, value]) => value !== undefined);
    return {
      id: limit.id,
      group: limit.group,
      value: found?.[1] ?? limit.defaultValue,
      source: found?.[0] ?? 'built-in',
      defaultValue: limit.defaultValue,
      min: limit.min,
      max: limit.max,
    };
  });
}

export function promptLimitValues(limits: readonly ResolvedPromptLimit[]): PromptLimits {
  const values: PromptLimits = { ...DEFAULT_PROMPT_LIMITS };
  for (const limit of limits) values[limit.id] = limit.value;
  return values;
}

export function promptPartTexts(parts: readonly ResolvedPromptPart[]): PromptPartTexts {
  const texts: PromptPartTexts = {};
  for (const part of parts) if (part.text !== part.defaultText) texts[part.id] = part.text;
  return texts;
}

export function createPromptPresetLibrary(
  dir: string | undefined,
  now: () => Date = () => new Date(),
): PromptPresetLibrary {
  const presetsDir = dir === undefined ? undefined : join(dir, 'presets');
  const globalFile = dir === undefined ? undefined : join(dir, 'global.json');
  const writeJson = (file: string, value: unknown) => {
    mkdirSync(join(file, '..'), { recursive: true });
    const temporary = `${file}.${process.pid}.tmp`;
    writeFileSync(temporary, JSON.stringify(value, null, 2), { encoding: 'utf8', mode: 0o600 });
    renameSync(temporary, file);
  };
  const readJson = (file: string): unknown => {
    try {
      return JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      return undefined;
    }
  };
  const list = (): PromptPreset[] => {
    if (presetsDir === undefined) return [];
    let names: string[];
    try {
      names = readdirSync(presetsDir).filter((entry) => entry.endsWith('.json'));
    } catch {
      return [];
    }
    return names
      .flatMap((entry) => {
        const preset = parsePreset(readJson(join(presetsDir, entry)));
        return preset === undefined || `${preset.id}.json` !== entry ? [] : [preset];
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  };
  const get = (id: string) =>
    PRESET_ID.test(id) && presetsDir !== undefined
      ? parsePreset(readJson(join(presetsDir, `${id}.json`)))
      : undefined;
  const validName = (name: unknown): name is string =>
    typeof name === 'string' && name.trim() !== '' && name.trim().length <= NAME_LIMIT;
  const nameTaken = (name: string, except?: string) =>
    list().some((preset) => preset.id !== except && preset.name === name.trim());
  const save = (preset: PromptPreset) => writeJson(join(presetsDir!, `${preset.id}.json`), preset);
  return {
    list,
    get,
    create(input) {
      if (presetsDir === undefined) return { ok: false, reason: 'unavailable' };
      if (!validName(input.name)) return { ok: false, reason: 'invalid-input' };
      if (nameTaken(input.name)) return { ok: false, reason: 'duplicate-name' };
      const preset: PromptPreset = {
        id: randomUUID(),
        name: input.name.trim(),
        revision: 1,
        parts: applyPromptPartEdits({}, input.parts ?? {}),
        limits: applyPromptLimitEdits({}, input.limits ?? {}),
        updatedAt: now().toISOString(),
      };
      save(preset);
      return { ok: true, value: preset };
    },
    update(id, input) {
      const current = get(id);
      if (current === undefined) return { ok: false, reason: 'not-found' };
      if (input.expectedRevision !== undefined && input.expectedRevision !== current.revision)
        return { ok: false, reason: 'stale-revision' };
      if (input.name !== undefined && !validName(input.name))
        return { ok: false, reason: 'invalid-input' };
      if (input.name !== undefined && nameTaken(input.name, id))
        return { ok: false, reason: 'duplicate-name' };
      const preset: PromptPreset = {
        ...current,
        name: input.name?.trim() ?? current.name,
        parts:
          input.parts === undefined
            ? current.parts
            : applyPromptPartEdits(current.parts, input.parts),
        limits:
          input.limits === undefined
            ? current.limits
            : applyPromptLimitEdits(current.limits, input.limits),
        revision: current.revision + 1,
        updatedAt: now().toISOString(),
      };
      save(preset);
      return { ok: true, value: preset };
    },
    delete(id) {
      if (get(id) === undefined) return { ok: false, reason: 'not-found' };
      rmSync(join(presetsDir!, `${id}.json`), { force: true });
      if (this.globalPresetId() === id) writeJson(globalFile!, {});
      return { ok: true, value: { id } };
    },
    globalPresetId() {
      if (globalFile === undefined) return undefined;
      const id = object(readJson(globalFile))?.['presetId'];
      return typeof id === 'string' && get(id) !== undefined ? id : undefined;
    },
    setGlobalPresetId(id) {
      if (globalFile === undefined) return { ok: false, reason: 'unavailable' };
      if (id !== undefined && get(id) === undefined) return { ok: false, reason: 'not-found' };
      writeJson(globalFile, id === undefined ? {} : { presetId: id });
      return { ok: true, value: { presetId: id ?? null } };
    },
  };
}
