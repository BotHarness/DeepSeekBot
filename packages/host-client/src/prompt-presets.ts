import { HostAnswerInvalid } from './bot-settings';
import type { HostClient } from './client';

export type PromptPresetClient = Pick<HostClient, 'call'>;

export interface PromptPartInfo {
  id: string;
  kind: 'system' | 'turn';
  section: string;
  defaultText: string;
  defaultHash: string;
}

export interface PromptLimitInfo {
  id: string;
  group: 'inbox' | 'review';
  defaultValue: number;
  min: number;
  max: number;
}

export interface PromptPartOverride {
  text: string;
  base: string;
}

export interface PromptPresetInfo {
  id: string;
  name: string;
  revision: number;
  parts: Record<string, PromptPartOverride>;
  limits: Record<string, number>;
  updatedAt: string;
}

export interface PromptParts {
  parts: PromptPartInfo[];
  limits: PromptLimitInfo[];
}

export interface PromptPresets {
  presets: PromptPresetInfo[];
  globalPresetId: string | null;
}

export type PromptLibrary = PromptParts & PromptPresets;

export interface PromptPresetChange {
  name?: string;
  parts?: Record<string, string | null>;
  limits?: Record<string, number | null>;
  expectedRevision?: number;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function text(value: unknown): value is string {
  return typeof value === 'string';
}

function count(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function list<T>(value: unknown, item: (row: Record<string, unknown>) => T | undefined): T[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const row = record(entry);
    const parsed = row === undefined ? undefined : item(row);
    return parsed === undefined ? [] : [parsed];
  });
}

function part(row: Record<string, unknown>): PromptPartInfo | undefined {
  const kind = row['kind'];
  if (
    !text(row['id']) ||
    (kind !== 'system' && kind !== 'turn') ||
    !text(row['defaultText']) ||
    !text(row['defaultHash'])
  )
    return undefined;
  return {
    id: row['id'],
    kind,
    section: text(row['section']) ? row['section'] : '',
    defaultText: row['defaultText'],
    defaultHash: row['defaultHash'],
  };
}

function limit(row: Record<string, unknown>): PromptLimitInfo | undefined {
  const group = row['group'];
  if (
    !text(row['id']) ||
    (group !== 'inbox' && group !== 'review') ||
    !count(row['defaultValue']) ||
    !count(row['min']) ||
    !count(row['max'])
  )
    return undefined;
  return {
    id: row['id'],
    group,
    defaultValue: row['defaultValue'],
    min: row['min'],
    max: row['max'],
  };
}

function overrides(value: unknown): Record<string, PromptPartOverride> {
  return Object.fromEntries(
    Object.entries(record(value) ?? {}).flatMap(([id, entry]) => {
      const row = record(entry);
      return text(row?.['text']) && text(row['base'])
        ? [[id, { text: row['text'], base: row['base'] }]]
        : [];
    }),
  );
}

function limitValues(value: unknown): Record<string, number> {
  return Object.fromEntries(
    Object.entries(record(value) ?? {}).filter((entry): entry is [string, number] =>
      count(entry[1]),
    ),
  );
}

function preset(row: Record<string, unknown>): PromptPresetInfo | undefined {
  if (!text(row['id']) || !text(row['name']) || !count(row['revision'])) return undefined;
  return {
    id: row['id'],
    name: row['name'],
    revision: row['revision'],
    parts: overrides(row['parts']),
    limits: limitValues(row['limits']),
    updatedAt: text(row['updatedAt']) ? row['updatedAt'] : '',
  };
}

function presetIdOf(value: unknown): string | null | undefined {
  return value === null || text(value) ? value : undefined;
}

export function parsePromptParts(value: unknown): PromptParts {
  const row = record(value);
  if (!Array.isArray(row?.['parts']))
    throw new HostAnswerInvalid('promptParts returned no prompt parts.');
  return { parts: list(row['parts'], part), limits: list(row['limits'], limit) };
}

export function parsePromptPresets(value: unknown): PromptPresets {
  const row = record(value);
  const global = presetIdOf(row?.['globalPresetId'] ?? null);
  if (!Array.isArray(row?.['presets']) || global === undefined)
    throw new HostAnswerInvalid('promptPresets returned no Prompt Presets.');
  return { presets: list(row['presets'], preset), globalPresetId: global };
}

function presetResult(value: unknown, method: string): { preset: PromptPresetInfo } {
  const row = record(record(value)?.['preset']);
  const parsed = row === undefined ? undefined : preset(row);
  if (parsed === undefined) throw new HostAnswerInvalid(`${method} returned no Prompt Preset.`);
  return { preset: parsed };
}

export async function loadPromptParts(client: PromptPresetClient): Promise<PromptParts> {
  return parsePromptParts(await client.call<unknown>('promptParts', {}));
}

export async function loadPromptPresets(client: PromptPresetClient): Promise<PromptPresets> {
  return parsePromptPresets(await client.call<unknown>('promptPresets', {}));
}

export async function loadPromptLibrary(client: PromptPresetClient): Promise<PromptLibrary> {
  const [parts, presets] = await Promise.all([loadPromptParts(client), loadPromptPresets(client)]);
  return { ...parts, ...presets };
}

export async function setGlobalPromptPreset(
  client: PromptPresetClient,
  presetId: string | null,
): Promise<{ presetId: string | null }> {
  const answer = record(await client.call<unknown>('promptGlobalSet', { presetId }));
  const chosen = presetIdOf(answer?.['presetId']);
  if (chosen === undefined)
    throw new HostAnswerInvalid('promptGlobalSet did not confirm the global preset.');
  return { presetId: chosen };
}

export async function createPromptPreset(
  client: PromptPresetClient,
  name: string,
  parts: Record<string, string | null>,
  limits?: Record<string, number | null>,
): Promise<{ preset: PromptPresetInfo }> {
  return presetResult(
    await client.call<unknown>('promptPresetCreate', {
      name,
      parts,
      ...(limits === undefined ? {} : { limits }),
    }),
    'promptPresetCreate',
  );
}

export async function updatePromptPreset(
  client: PromptPresetClient,
  id: string,
  change: PromptPresetChange,
): Promise<{ preset: PromptPresetInfo }> {
  return presetResult(
    await client.call<unknown>('promptPresetUpdate', { id, ...change }),
    'promptPresetUpdate',
  );
}

export async function deletePromptPreset(
  client: PromptPresetClient,
  id: string,
): Promise<{ id: string; clearedBots: string[] }> {
  const row = record(await client.call<unknown>('promptPresetDelete', { id }));
  if (!text(row?.['id']))
    throw new HostAnswerInvalid('promptPresetDelete did not confirm the deletion.');
  return {
    id: row['id'],
    clearedBots: Array.isArray(row['clearedBots']) ? row['clearedBots'].filter(text) : [],
  };
}

export function promptPresetChanges(preset: PromptPresetInfo): number {
  return Object.keys(preset.parts).length + Object.keys(preset.limits).length;
}

export function promptPresetStale(preset: PromptPresetInfo, parts: PromptPartInfo[]): boolean {
  return Object.entries(preset.parts).some(
    ([id, override]) => override.base !== parts.find((entry) => entry.id === id)?.defaultHash,
  );
}
