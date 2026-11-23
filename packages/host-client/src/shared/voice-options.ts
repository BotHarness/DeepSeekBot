import {
  uniqueProviderName,
  type VoiceCatalogCollection,
  type VoiceCatalogItem,
} from '@botharness/host-protocol/voice-catalog';

export const CUSTOM_CHOICE = '\u0000custom';

export const CATALOG_MAX_RESULTS = 200;

export interface Choice {
  readonly choice: string;
  readonly custom: string;
  readonly catalogName?: string;
}

export function choiceValues(options: readonly string[], fallback?: string): string[] {
  const values: string[] = [];
  for (const value of fallback === undefined ? options : [fallback, ...options])
    if (value.trim() !== '' && !values.includes(value)) values.push(value);
  return values;
}

export function initialChoice(options: readonly string[], fallback?: string): Choice {
  const values = choiceValues(options, fallback);
  return { choice: values[0] ?? CUSTOM_CHOICE, custom: '' };
}

export function chosenValue(state: Choice): string | undefined {
  const value = state.choice === CUSTOM_CHOICE ? state.custom.trim() : state.choice;
  return value === '' ? undefined : value;
}

export function defaultProviderName(
  presetName: string,
  providers: readonly { readonly name: string }[],
): string {
  return uniqueProviderName(
    presetName,
    providers.map((provider) => provider.name),
  );
}

export function mergeCatalogItems(
  previous: readonly VoiceCatalogItem[],
  next: readonly VoiceCatalogItem[],
  collection: VoiceCatalogCollection,
): VoiceCatalogItem[] {
  const merged = [...new Map([...previous, ...next].map((item) => [item.id, item])).values()];
  return collection === 'models' ? merged : merged.slice(0, CATALOG_MAX_RESULTS);
}
