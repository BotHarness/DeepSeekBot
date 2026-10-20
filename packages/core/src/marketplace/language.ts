export const MARKETPLACE_LANGUAGES = ['zh', 'en'] as const;

export type MarketplaceLanguage = (typeof MARKETPLACE_LANGUAGES)[number];

const LANGUAGE_TAG = /^([a-z]{2,3})(?:[-_][a-z0-9]{1,8})*$/iu;

export function parseMarketplaceLanguage(
  value: string | null | undefined,
): MarketplaceLanguage | undefined {
  const base = LANGUAGE_TAG.exec(value?.trim() ?? '')?.[1]?.toLowerCase();
  return base === 'zh' || base === 'en' ? base : undefined;
}

const README_FILE = /^readme[._-]([a-z]{2,3}(?:[-_][a-z0-9]{1,8})*)\.(?:md|markdown)$/iu;

export function readmeFileLanguage(fileName: string): MarketplaceLanguage | undefined {
  const tag = README_FILE.exec(fileName)?.[1];
  if (tag === undefined) return undefined;
  return tag.toLowerCase() === 'cn' ? 'zh' : parseMarketplaceLanguage(tag);
}

const HAN = /\p{Script=Han}/gu;
const LATIN = /\p{Script=Latin}/gu;

export function guessTextLanguage(text: string): MarketplaceLanguage | undefined {
  const han = text.match(HAN)?.length ?? 0;
  const latin = text.match(LATIN)?.length ?? 0;
  if (han === 0 && latin === 0) return undefined;
  return han * 3 >= latin ? 'zh' : 'en';
}
