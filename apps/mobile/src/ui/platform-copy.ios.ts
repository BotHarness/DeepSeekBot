export const tapVerb = { en: 'Tap', zh: '轻点' };

const MINOR = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'but',
  'by',
  'for',
  'from',
  'in',
  'into',
  'nor',
  'of',
  'on',
  'or',
  'per',
  'the',
  'to',
  'up',
  'via',
  'with',
]);

const CJK = /[　-鿿＀-￯]/u;

export function controlCase(text: string): string {
  if (CJK.test(text)) return text;
  const words = text.split(' ');
  return words
    .map((word, index) => {
      if (!/^[a-z]/u.test(word) || /[A-Z\d]/u.test(word.slice(1))) return word;
      const edge = index === 0 || index === words.length - 1;
      if (!edge && MINOR.has(word.replace(/[^a-z]/gu, ''))) return word;
      return word[0]!.toUpperCase() + word.slice(1);
    })
    .join(' ');
}
