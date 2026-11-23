export type VoiceCatalogCollection = 'models' | 'account' | 'public';

export interface VoiceCatalogInput {
  readonly kind: 'tts' | 'asr';
  readonly preset: string;
  readonly collection: VoiceCatalogCollection;
  readonly key: string;
  readonly query?: string | undefined;
  readonly cursor?: string | undefined;
}

export interface VoiceCatalogImportInput {
  readonly preset: string;
  readonly key: string;
  readonly ownerId: string;
  readonly voiceId: string;
  readonly name: string;
  readonly confirmed: true;
}

export interface VoiceCatalogItem {
  readonly id: string;
  readonly name: string;
  readonly importFrom?: string;
  readonly previewUrl?: string;
}

export interface VoiceCatalogPage {
  readonly items: readonly VoiceCatalogItem[];
  readonly nextCursor?: string;
}

export function uniqueProviderName(base: string, taken: readonly string[]): string {
  const names = new Set(taken.map((name) => name.trim().toLowerCase()));
  if (!names.has(base.trim().toLowerCase())) return base;
  for (let index = 2; ; index += 1) {
    const candidate = `${base} ${index}`;
    if (!names.has(candidate.toLowerCase())) return candidate;
  }
}

const HTTPS_LINK = /^https:\/\/[^\s/?#@]+(?:[/?#]\S*)?$/iu;

function httpsLink(raw: unknown): string | undefined {
  return typeof raw === 'string' && HTTPS_LINK.test(raw) ? raw : undefined;
}

export function voiceCatalogItem(raw: unknown): VoiceCatalogItem | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  const item = raw as Record<string, unknown>;
  const { id, name, importFrom } = item;
  if (
    typeof id !== 'string' ||
    typeof name !== 'string' ||
    (importFrom !== undefined && typeof importFrom !== 'string')
  )
    return undefined;
  const previewUrl = httpsLink(item['previewUrl']);
  return {
    id,
    name,
    ...(importFrom === undefined ? {} : { importFrom }),
    ...(previewUrl === undefined ? {} : { previewUrl }),
  };
}
