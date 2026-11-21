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
