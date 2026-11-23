import { z } from 'zod';
import type {
  VoiceCatalogCollection,
  VoiceCatalogImportInput,
  VoiceCatalogInput,
  VoiceCatalogItem,
  VoiceCatalogPage,
} from '@botharness/host-protocol/voice-catalog';
import { MIMO_ASR_MODEL, MIMO_TTS_MODEL } from './mimo.js';

export type {
  VoiceCatalogCollection,
  VoiceCatalogImportInput,
  VoiceCatalogInput,
  VoiceCatalogItem,
  VoiceCatalogPage,
} from '@botharness/host-protocol/voice-catalog';

export const MIMO_BASE_URL = 'https://api.xiaomimimo.com/v1';
export const FISH_BASE_URL = 'https://api.fish.audio';
export const ELEVENLABS_BASE_URL = 'https://api.elevenlabs.io';
const PAGE_SIZE = 25;

export const voiceCatalogInput = z.object({
  kind: z.enum(['tts', 'asr']),
  preset: z.string().min(1).max(80),
  collection: z.enum(['models', 'account', 'public']),
  key: z.string().trim().min(1).max(4_096),
  query: z.string().trim().max(120).optional(),
  cursor: z.string().min(1).max(512).optional(),
}) satisfies z.ZodType<VoiceCatalogInput>;

const entryId = z.string().min(1).max(200);
const pathId = entryId.regex(/^[a-zA-Z0-9_-]+$/u);
const entryName = z.string().trim().min(1).max(200);
const previewLink = z.string().max(2_048).nullish();
const fishSample = z.object({ audio: previewLink }).passthrough();

export const voiceCatalogImportInput = z.object({
  preset: voiceCatalogInput.shape.preset,
  key: voiceCatalogInput.shape.key,
  ownerId: pathId,
  voiceId: pathId,
  name: entryName,
  confirmed: z.literal(true),
}) satisfies z.ZodType<VoiceCatalogImportInput>;

interface CatalogRequest<T> {
  readonly url: URL;
  readonly init: RequestInit;
  parse(body: unknown): T | undefined;
}

type CatalogOperation = (query: VoiceCatalogInput) => CatalogRequest<VoiceCatalogPage> | undefined;
type CatalogCapabilities = Partial<Record<VoiceCatalogCollection, CatalogOperation>>;

const fishVoices = z.object({
  items: z.array(
    z.object({
      _id: entryId,
      title: entryName,
      visibility: z.string(),
      samples: z.array(fishSample).nullish(),
    }),
  ),
  total: z.number().int().nonnegative(),
  has_more: z.boolean().nullish(),
});

const elevenModels = z.array(
  z.object({
    model_id: entryId,
    name: entryName.optional(),
    can_do_text_to_speech: z.boolean().optional(),
  }),
);
const elevenVoice = z.object({ voice_id: entryId, name: entryName, preview_url: previewLink });
const elevenAccountVoices = z.object({
  voices: z.array(elevenVoice),
  has_more: z.boolean(),
  next_page_token: z.string().max(512).nullish(),
});
const elevenPublicVoices = z.object({
  voices: z.array(elevenVoice.extend({ public_owner_id: pathId, voice_id: pathId })),
  has_more: z.boolean(),
});
const mimoModels = z.object({ data: z.array(z.object({ id: entryId })) });

function index(cursor: string | undefined, first: number): number | undefined {
  if (cursor === undefined) return first;
  if (!/^\d{1,7}$/u.test(cursor)) return undefined;
  const page = Number(cursor);
  return page >= first ? page : undefined;
}

const PREVIEW_HOSTS: readonly ((host: string) => boolean)[] = [
  (host) => host === 'fish.audio' || host.endsWith('.fish.audio'),
  (host) => host === 'storage.googleapis.com' || host.endsWith('.elevenlabs.io'),
];

function preview(link: string | null | undefined): { previewUrl?: string } {
  if (typeof link !== 'string') return {};
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return {};
  }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '') return {};
  return PREVIEW_HOSTS.some((allowed) => allowed(url.hostname)) ? { previewUrl: url.href } : {};
}

function list(items: readonly VoiceCatalogItem[], nextCursor?: string): VoiceCatalogPage {
  return nextCursor === undefined ? { items } : { items, nextCursor };
}

function matchesModel(entry: VoiceCatalogItem, query: string | undefined) {
  if (query === undefined || query === '') return true;
  const text = `${entry.id} ${entry.name}`.toLowerCase();
  return text.includes(query.toLowerCase());
}

function fishVoiceList(query: VoiceCatalogInput): CatalogRequest<VoiceCatalogPage> | undefined {
  const page = index(query.cursor, 1);
  if (page === undefined) return undefined;
  const url = new URL('/model', FISH_BASE_URL);
  const account = query.collection === 'account';
  url.searchParams.set('self', String(account));
  url.searchParams.set('page_number', String(page));
  url.searchParams.set('page_size', String(PAGE_SIZE));
  if (query.query) url.searchParams.set('title', query.query);
  return {
    url,
    init: { headers: { Authorization: `Bearer ${query.key}` } },
    parse(body) {
      const result = fishVoices.safeParse(body);
      if (!result.success) return undefined;
      const { items, total, has_more: hasMore } = result.data;
      return list(
        items
          .filter((item) => account || item.visibility === 'public')
          .slice(0, PAGE_SIZE)
          .map((item) => ({
            id: item._id,
            name: item.title,
            ...preview(item.samples?.find((sample) => sample.audio)?.audio),
          })),
        (hasMore ?? page * PAGE_SIZE < total) ? String(page + 1) : undefined,
      );
    },
  };
}

function elevenModelList(query: VoiceCatalogInput): CatalogRequest<VoiceCatalogPage> | undefined {
  if (query.cursor !== undefined) return undefined;
  return {
    url: new URL('/v1/models', ELEVENLABS_BASE_URL),
    init: { headers: { 'xi-api-key': query.key } },
    parse(body) {
      const result = elevenModels.safeParse(body);
      if (!result.success) return undefined;
      return list(
        result.data
          .filter((model) => model.can_do_text_to_speech === true)
          .map((model) => ({ id: model.model_id, name: model.name ?? model.model_id }))
          .filter((item) => matchesModel(item, query.query)),
      );
    },
  };
}

function elevenAccountList(query: VoiceCatalogInput): CatalogRequest<VoiceCatalogPage> {
  const url = new URL('/v2/voices', ELEVENLABS_BASE_URL);
  url.searchParams.set('page_size', String(PAGE_SIZE));
  url.searchParams.set('include_total_count', 'false');
  if (query.query) url.searchParams.set('search', query.query);
  if (query.cursor !== undefined) url.searchParams.set('next_page_token', query.cursor);
  return {
    url,
    init: { headers: { 'xi-api-key': query.key } },
    parse(body) {
      const result = elevenAccountVoices.safeParse(body);
      if (!result.success) return undefined;
      const { voices, has_more: hasMore, next_page_token: next } = result.data;
      return list(
        voices.map((voice) => ({
          id: voice.voice_id,
          name: voice.name,
          ...preview(voice.preview_url),
        })),
        hasMore && next && next !== query.cursor ? next : undefined,
      );
    },
  };
}

function elevenPublicList(query: VoiceCatalogInput): CatalogRequest<VoiceCatalogPage> | undefined {
  const page = index(query.cursor, 0);
  if (page === undefined) return undefined;
  const url = new URL('/v1/shared-voices', ELEVENLABS_BASE_URL);
  url.searchParams.set('page', String(page));
  url.searchParams.set('page_size', String(PAGE_SIZE));
  if (query.query) url.searchParams.set('search', query.query);
  return {
    url,
    init: { headers: { 'xi-api-key': query.key } },
    parse(body) {
      const result = elevenPublicVoices.safeParse(body);
      if (!result.success) return undefined;
      return list(
        result.data.voices.slice(0, PAGE_SIZE).map((voice) => ({
          id: voice.voice_id,
          name: voice.name,
          importFrom: voice.public_owner_id,
          ...preview(voice.preview_url),
        })),
        result.data.has_more ? String(page + 1) : undefined,
      );
    },
  };
}

function mimoModelList(query: VoiceCatalogInput): CatalogRequest<VoiceCatalogPage> | undefined {
  if (query.cursor !== undefined) return undefined;
  const supported = query.kind === 'tts' ? MIMO_TTS_MODEL : MIMO_ASR_MODEL;
  return {
    url: new URL(`${MIMO_BASE_URL}/models`),
    init: { headers: { 'api-key': query.key } },
    parse(body) {
      const result = mimoModels.safeParse(body);
      if (!result.success) return undefined;
      return list(
        result.data.data
          .filter((model) => model.id === supported)
          .map((model) => ({ id: model.id, name: model.id }))
          .filter((item) => matchesModel(item, query.query)),
      );
    },
  };
}

const catalogs = new Map<string, CatalogCapabilities>([
  ['tts:fish-audio', { account: fishVoiceList, public: fishVoiceList }],
  [
    'tts:elevenlabs',
    { models: elevenModelList, account: elevenAccountList, public: elevenPublicList },
  ],
  ['tts:xiaomi-mimo', { models: mimoModelList }],
  ['asr:xiaomi-mimo', { models: mimoModelList }],
]);

export function voiceCatalogCollections(kind: VoiceCatalogInput['kind'], preset: string) {
  const adapter = catalogs.get(`${kind}:${preset}`);
  return (['models', 'account', 'public'] as const).filter(
    (collection) => adapter?.[collection] !== undefined,
  );
}

export function voiceCatalogRequest(query: VoiceCatalogInput) {
  return catalogs.get(`${query.kind}:${query.preset}`)?.[query.collection]?.(query);
}

const addedVoice = z.object({ voice_id: entryId });

function elevenImportRequest(input: VoiceCatalogImportInput): CatalogRequest<VoiceCatalogItem> {
  const { ownerId, voiceId, name, key } = input;
  return {
    url: new URL(
      `/v1/voices/add/${encodeURIComponent(ownerId)}/${encodeURIComponent(voiceId)}`,
      ELEVENLABS_BASE_URL,
    ),
    init: {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ new_name: name }),
    },
    parse(body) {
      const result = addedVoice.safeParse(body);
      return result.success ? { id: result.data.voice_id, name } : undefined;
    },
  };
}

const importers = new Map([['elevenlabs', elevenImportRequest]]);

export function voiceCatalogImportRequest(input: VoiceCatalogImportInput) {
  return importers.get(input.preset)?.(input);
}
