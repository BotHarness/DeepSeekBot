import {
  guessTextLanguage,
  MARKETPLACE_LANGUAGES,
  parseMarketplaceLanguage,
  readmeFileLanguage,
  type MarketplaceLanguage,
} from '../../core/src/marketplace/language.js';
import type { BotDescriptorLocalization } from '../../core/src/marketplace/descriptor.js';

export { MARKETPLACE_LANGUAGES, parseMarketplaceLanguage, type MarketplaceLanguage };

export type LanguageMap<T> = Partial<Record<MarketplaceLanguage, T>>;

export interface LocalizationColumns {
  description: string | null;
  bio: string | null;
  display_name: string | null;
  readmes: string | null;
  localized: string | null;
  summary: string | null;
}

const README_PREFERENCE = ['readme.zh-cn.md', 'readme.zh.md', 'readme.en.md'];

export function localizedReadmeFiles(files: readonly string[]): LanguageMap<string> {
  const found: LanguageMap<string> = {};
  const ranked = [...files].sort((left, right) => {
    const rank = (name: string) => {
      const index = README_PREFERENCE.indexOf(name.toLowerCase());
      return index === -1 ? README_PREFERENCE.length : index;
    };
    return rank(left) - rank(right) || left.localeCompare(right);
  });
  for (const file of ranked) {
    const language = readmeFileLanguage(file);
    if (language !== undefined && found[language] === undefined) found[language] = file;
  }
  return found;
}

export function parseLanguageMap<T>(
  value: string | null,
  accept: (item: unknown) => item is T,
): LanguageMap<T> {
  if (value === null) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return {};
  }
  if (typeof parsed !== 'object' || parsed === null) return {};
  const map: LanguageMap<T> = {};
  for (const language of MARKETPLACE_LANGUAGES) {
    const item = (parsed as Record<string, unknown>)[language];
    if (accept(item)) map[language] = item;
  }
  return map;
}

export const isText = (item: unknown): item is string =>
  typeof item === 'string' && item.length > 0;

const isLocalization = (item: unknown): item is BotDescriptorLocalization =>
  typeof item === 'object' && item !== null;

export function storedMap(map: LanguageMap<unknown>): string | null {
  return Object.keys(map).length === 0 ? null : JSON.stringify(map);
}

export function searchText(row: Pick<LocalizationColumns, 'readmes' | 'localized' | 'summary'>) {
  const localized = parseLanguageMap(row.localized, isLocalization);
  const parts = MARKETPLACE_LANGUAGES.flatMap((language) => [
    localized[language]?.name,
    localized[language]?.bio,
    parseLanguageMap(row.summary, isText)[language],
    parseLanguageMap(row.readmes, isText)[language],
  ]).filter(isText);
  return parts.length === 0 ? null : parts.join('\n');
}

export interface LocalizedPresentation {
  displayName: string | null;
  bio: string | null;
  bioGenerated: boolean;
}

export function localizedPresentation(
  row: LocalizationColumns,
  language: MarketplaceLanguage | undefined,
): LocalizedPresentation {
  const original = row.bio ?? row.description;
  if (language === undefined) {
    return { displayName: row.display_name, bio: original, bioGenerated: false };
  }
  const translation = parseLanguageMap(row.localized, isLocalization)[language];
  const displayName = translation?.name ?? row.display_name;
  if (translation?.bio !== undefined) {
    return { displayName, bio: translation.bio, bioGenerated: false };
  }
  if (original !== null && guessTextLanguage(original) === language) {
    return { displayName, bio: original, bioGenerated: false };
  }
  const generated = parseLanguageMap(row.summary, isText)[language];
  return generated === undefined
    ? { displayName, bio: original, bioGenerated: false }
    : { displayName, bio: generated, bioGenerated: true };
}

export function languagesWithoutAuthorBio(row: LocalizationColumns): MarketplaceLanguage[] {
  const localized = parseLanguageMap(row.localized, isLocalization);
  const original = row.bio ?? row.description;
  const originalLanguage = original === null ? undefined : guessTextLanguage(original);
  return MARKETPLACE_LANGUAGES.filter(
    (language) => localized[language]?.bio === undefined && originalLanguage !== language,
  );
}

export function localizedReadme(
  row: Pick<LocalizationColumns, 'readmes'> & { readme: string | null },
  language: MarketplaceLanguage | undefined,
): { markdown: string | null; language: MarketplaceLanguage | null } {
  const variants = parseLanguageMap(row.readmes, isText);
  const variant = language === undefined ? undefined : variants[language];
  return variant === undefined
    ? { markdown: row.readme, language: null }
    : { markdown: variant, language: language ?? null };
}

export function readmeLanguages(row: Pick<LocalizationColumns, 'readmes'>): MarketplaceLanguage[] {
  const variants = parseLanguageMap(row.readmes, isText);
  return MARKETPLACE_LANGUAGES.filter((language) => variants[language] !== undefined);
}
