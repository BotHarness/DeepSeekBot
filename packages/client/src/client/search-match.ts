import { match as pinyinMatch } from 'pinyin-pro';

const HAN = /\p{Script=Han}/u;
const LATIN_QUERY = /^[a-z\s']+$/u;
const WORD_BOUNDARY = /[\s\-_./·・]/u;

export function normalizeSearchText(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase().trim();
}

export function searchTextScore(text: string, query: string): number | undefined {
  const name = normalizeSearchText(text);
  const normalized = normalizeSearchText(query);
  if (normalized.length === 0) return undefined;
  if (name === normalized) return 0;
  if (name.startsWith(normalized)) return 1;
  const index = name.indexOf(normalized);
  if (index > 0) return WORD_BOUNDARY.test(name[index - 1] ?? '') ? 2 : 3;
  if (!HAN.test(name) || !LATIN_QUERY.test(normalized)) return undefined;
  const hits = pinyinMatch(name, normalized.replace(/[\s']+/gu, ''));
  if (hits === null || hits.length === 0) return undefined;
  return hits[0] === 0 ? 4 : 5;
}

export function searchTextMatches(text: string, query: string): boolean {
  return searchTextScore(text, query) !== undefined;
}
