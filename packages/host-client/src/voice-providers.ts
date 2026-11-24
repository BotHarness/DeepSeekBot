import {
  voiceCatalogItem,
  type VoiceCatalogCollection,
  type VoiceCatalogImportInput,
  type VoiceCatalogInput,
  type VoiceCatalogItem,
  type VoiceCatalogPage,
} from '@botharness/host-protocol/voice-catalog';
import type { VoiceRequestTemplate } from '@botharness/host-protocol/voice-request-template';

import { MethodRefused } from './client-errors';
import {
  answerRecord,
  finiteNumber,
  HostAnswerInvalid,
  record,
  some,
  strings,
  text,
  type HostCall,
} from './host-answer';

export type VoiceKind = 'tts' | 'asr';

export interface VoicePresetView {
  readonly id: string;
  readonly name: string;
  readonly baseUrl?: string;
  readonly keyRequired: boolean;
  readonly defaultModel?: string;
  readonly models?: readonly string[];
  readonly defaultVoice?: string;
  readonly voices?: readonly { readonly id: string; readonly name: string }[];
  readonly catalogs?: readonly VoiceCatalogCollection[];
}

export interface VoiceServiceView {
  readonly id: string;
  readonly name: string;
  readonly preset: string;
  readonly baseUrl: string;
  readonly keySet: boolean;
  readonly defaultVoice?: string;
  readonly hasTemplate?: boolean;
}

export interface VoiceDefaultsView {
  readonly tts: { readonly providerId: string; readonly voiceId?: string } | null;
  readonly asr: { readonly providerId: string } | null;
}

export interface VoiceServicesView {
  readonly presets: readonly VoicePresetView[];
  readonly providers: readonly VoiceServiceView[];
  readonly asrPresets: readonly VoicePresetView[];
  readonly asrProviders: readonly VoiceServiceView[];
  readonly defaults: VoiceDefaultsView;
}

export type VoiceServiceHealth =
  | { readonly ok: true; readonly latencyMs: number }
  | { readonly ok: false; readonly message: string };

export interface VoiceServiceAdd {
  readonly kind: VoiceKind;
  readonly preset: string;
  readonly name?: string;
  readonly baseUrl?: string;
  readonly model?: string;
  readonly defaultVoice?: string;
  readonly key?: string;
  readonly template?: VoiceRequestTemplate;
}

const COLLECTIONS: readonly VoiceCatalogCollection[] = ['models', 'account', 'public'];

export function voiceAccessDenied(error: unknown): boolean {
  return error instanceof MethodRefused && error.code === 'remote-access/denied';
}

export function presetsOf(view: VoiceServicesView, kind: VoiceKind): readonly VoicePresetView[] {
  return kind === 'tts' ? view.presets : view.asrPresets;
}

export function servicesOf(view: VoiceServicesView, kind: VoiceKind): readonly VoiceServiceView[] {
  return kind === 'tts' ? view.providers : view.asrProviders;
}

function parsePreset(value: unknown): VoicePresetView | undefined {
  const row = record(value);
  if (row === undefined || !text(row['id']) || !text(row['name'])) return undefined;
  const voices = some(row['voices'], (entry) => {
    const voice = record(entry);
    return voice !== undefined && text(voice['id']) && text(voice['name'])
      ? { id: voice['id'], name: voice['name'] }
      : undefined;
  });
  const catalogs = Array.isArray(row['catalogs'])
    ? row['catalogs'].filter((entry): entry is VoiceCatalogCollection =>
        COLLECTIONS.includes(entry as VoiceCatalogCollection),
      )
    : [];
  return {
    id: row['id'],
    name: row['name'],
    ...(text(row['baseUrl']) ? { baseUrl: row['baseUrl'] } : {}),
    keyRequired: row['keyRequired'] === true,
    ...(text(row['defaultModel']) ? { defaultModel: row['defaultModel'] } : {}),
    ...(strings(row['models']) ? { models: row['models'] } : {}),
    ...(text(row['defaultVoice']) ? { defaultVoice: row['defaultVoice'] } : {}),
    ...(voices.length === 0 ? {} : { voices }),
    ...(catalogs.length === 0 ? {} : { catalogs }),
  };
}

export function voiceServiceRecord(value: unknown, method: string): Record<string, unknown> {
  const row = record(value);
  if (
    row === undefined ||
    !text(row['id']) ||
    !text(row['name']) ||
    !text(row['baseUrl']) ||
    typeof row['keySet'] !== 'boolean'
  )
    throw new HostAnswerInvalid(`invalid ${method} response`);
  return row;
}

export function voiceServiceView(row: Record<string, unknown>): VoiceServiceView {
  return {
    id: row['id'] as string,
    name: row['name'] as string,
    preset: text(row['preset']) ? row['preset'] : 'custom',
    baseUrl: row['baseUrl'] as string,
    keySet: row['keySet'] === true,
    ...(text(row['defaultVoice']) ? { defaultVoice: row['defaultVoice'] } : {}),
    ...(row['hasTemplate'] === true ? { hasTemplate: true } : {}),
  };
}

function parseDefaults(value: unknown): VoiceDefaultsView {
  const row = record(value);
  const tts = record(row?.['tts']);
  const asr = record(row?.['asr']);
  return {
    tts:
      tts !== undefined && text(tts['providerId'])
        ? {
            providerId: tts['providerId'],
            ...(text(tts['voiceId']) ? { voiceId: tts['voiceId'] } : {}),
          }
        : null,
    asr: asr !== undefined && text(asr['providerId']) ? { providerId: asr['providerId'] } : null,
  };
}

export async function readVoiceProviders(
  host: HostCall,
  slug?: string,
): Promise<Record<string, unknown>> {
  const method = 'voiceProviders';
  const answer = answerRecord(await host.call(method, slug === undefined ? {} : { slug }), method);
  if (!Array.isArray(answer['presets']) || !Array.isArray(answer['providers']))
    throw new HostAnswerInvalid(`invalid ${method} response`);
  return answer;
}

export async function loadVoiceServices(host: HostCall): Promise<VoiceServicesView> {
  const answer = await readVoiceProviders(host);
  const services = (rows: unknown) =>
    Array.isArray(rows)
      ? rows.map((row) => voiceServiceView(voiceServiceRecord(row, 'voiceProviders')))
      : [];
  return {
    presets: some(answer['presets'], parsePreset),
    providers: services(answer['providers']),
    asrPresets: some(answer['asrPresets'], parsePreset),
    asrProviders: services(answer['asrProviders']),
    defaults: parseDefaults(answer['defaults']),
  };
}

export async function addVoiceProvider(
  host: HostCall,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const method = 'voiceProviderAdd';
  return voiceServiceRecord(
    answerRecord(await host.call(method, payload), method)['provider'],
    method,
  );
}

export async function addVoiceService(
  host: HostCall,
  input: VoiceServiceAdd,
): Promise<VoiceServiceView> {
  const { kind, ...rest } = input;
  return voiceServiceView(await addVoiceProvider(host, kind === 'asr' ? { kind, ...rest } : rest));
}

export async function removeVoiceService(host: HostCall, id: string): Promise<string[]> {
  const answer = answerRecord(
    await host.call('voiceProviderRemove', { id }),
    'voiceProviderRemove',
  );
  return Array.isArray(answer['clearedBots']) ? answer['clearedBots'].filter(text) : [];
}

export async function testVoiceProvider(
  host: HostCall,
  id: string,
  voiceId?: string,
): Promise<Record<string, unknown>> {
  const method = 'voiceProviderTest';
  const answer = answerRecord(
    await host.call(method, voiceId === undefined ? { id } : { id, voiceId }),
    method,
  );
  if (typeof answer['ok'] !== 'boolean') throw new HostAnswerInvalid(`invalid ${method} response`);
  return answer;
}

export async function testVoiceService(host: HostCall, id: string): Promise<VoiceServiceHealth> {
  const answer = await testVoiceProvider(host, id);
  return answer['ok'] === true
    ? {
        ok: true,
        latencyMs: finiteNumber(answer['latencyMs']) ? Math.round(answer['latencyMs']) : 0,
      }
    : { ok: false, message: text(answer['message']) ? answer['message'] : '' };
}

export async function setVoiceDefaultAnswer(
  host: HostCall,
  kind: VoiceKind,
  providerId: string | null,
  voiceId?: string,
): Promise<unknown> {
  const answer = answerRecord(
    await host.call('voiceDefaultSet', {
      kind,
      providerId,
      ...(voiceId === undefined ? {} : { voiceId }),
    }),
    'voiceDefaultSet',
  );
  return answer['defaults'];
}

export async function setVoiceDefault(
  host: HostCall,
  kind: VoiceKind,
  providerId: string | null,
  voiceId?: string,
): Promise<VoiceDefaultsView> {
  return parseDefaults(await setVoiceDefaultAnswer(host, kind, providerId, voiceId));
}

export async function browseVoiceCatalog(
  host: HostCall,
  input: VoiceCatalogInput,
): Promise<VoiceCatalogPage> {
  const answer = answerRecord(
    await host.call('voiceCatalog', {
      kind: input.kind,
      preset: input.preset,
      collection: input.collection,
      key: input.key,
      ...(input.query === undefined || input.query === '' ? {} : { query: input.query }),
      ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
    }),
    'voiceCatalog',
  );
  const items = some(answer['items'], voiceCatalogItem);
  return text(answer['nextCursor']) ? { items, nextCursor: answer['nextCursor'] } : { items };
}

export async function importSharedVoice(
  host: HostCall,
  input: VoiceCatalogImportInput,
): Promise<VoiceCatalogItem> {
  const answer = answerRecord(
    await host.call('voiceCatalogImport', { ...input }),
    'voiceCatalogImport',
  );
  const voice = voiceCatalogItem(answer['voice']);
  if (voice === undefined) throw new HostAnswerInvalid('voiceCatalogImport returned no voice.');
  return voice;
}
