const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

export function messagePreview(body: string, limit = 2000): string {
  if (body.length <= limit) return body;
  let end = 0;
  for (const part of segmenter.segment(body)) {
    const next = part.index + part.segment.length;
    if (next > limit) break;
    end = next;
  }
  return body.slice(0, end);
}

export function messageGraphemeBoundaries(body: string): readonly number[] {
  return [0, ...Array.from(segmenter.segment(body), (part) => part.index + part.segment.length)];
}

export function plainMarkdown(body: string): string {
  return body
    .replace(/!\[([^\]\n]*)\]\([^)\n]*\)/gu, '$1')
    .replace(/\[([^\]\n]+)\]\([^)\n]*\)/gu, '$1')
    .replace(/(\*\*|~~)(?=\S)([^\n]*?\S)\1/gu, '$2')
    .replace(/(^|[^\p{L}\p{N}_\\])__(?=\S)([^\n]*?\S)__(?![\p{L}\p{N}_])/gu, '$1$2')
    .replace(/(^|[^\p{L}\p{N}*_\\])([*_])(?=\S)([^\n*_]*?\S)\2(?![\p{L}\p{N}])/gu, '$1$3')
    .replace(/(`+)([^`\n]+)\1/gu, '$2')
    .replace(/^ {0,3}(?:#{1,6}[ \t]+|>[ \t]?)/gmu, '');
}

export function hasVisibleText(value: string): boolean {
  return /[^\s\u200b-\u200f\u2060\ufeff]/u.test(value);
}
