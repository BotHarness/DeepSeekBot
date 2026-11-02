import { graphemeSegments } from 'unicode-segmenter/grapheme';

import { streamReveal } from '../design/tokens';

export type RevealGlyph = { text: string; offset: number; at: number; delay: number };
export type TextReveal = { text: string; prefix: string; glyphs: RevealGlyph[] };

export function appendTextReveal(
  previous: TextReveal | undefined,
  text: string,
  now: number,
): TextReveal {
  if (previous !== undefined && !text.startsWith(previous.text))
    return { text, prefix: text, glyphs: [] };
  const offset = previous?.text.length ?? 0;
  const from = previous?.glyphs.at(-1)?.offset ?? 0;
  const segments: Array<{ segment: string; index: number }> = [];
  for (const part of graphemeSegments(text.slice(from))) {
    const index = from + part.index;
    if (index + part.segment.length <= offset) continue;
    segments.push({ segment: part.segment, index });
    if (segments.length > streamReveal.maxGlyphs) segments.shift();
  }
  const size = Math.max(1, Math.ceil(segments.length / streamReveal.maxFreshSpans));
  const fresh: RevealGlyph[] = [];
  for (let index = 0; index < segments.length; index += size) {
    const group = segments.slice(index, index + size);
    fresh.push({
      text: group.map((part) => part.segment).join(''),
      offset: group[0]!.index,
      at: now,
      delay: (index * streamReveal.stagger) / Math.max(1, segments.length - size),
    });
  }
  const glyphs = [
    ...(previous?.glyphs
      .filter(
        (glyph) =>
          glyph.offset < (fresh[0]?.offset ?? text.length) &&
          now < glyph.at + glyph.delay + streamReveal.duration,
      )
      .map((glyph) => {
        const length = (fresh[0]?.offset ?? text.length) - glyph.offset;
        return length >= glyph.text.length
          ? glyph
          : { ...glyph, text: glyph.text.slice(0, length) };
      }) ?? []),
    ...fresh,
  ].slice(-streamReveal.maxGlyphs);
  return { text, prefix: text.slice(0, glyphs[0]?.offset ?? text.length), glyphs };
}
