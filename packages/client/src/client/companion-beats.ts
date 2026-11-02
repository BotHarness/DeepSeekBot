import { plainMarkdown } from '../../../core/src/channels/message-preview.js';

const STOP = /^[。！？!?…；;\n]$/u;
const CLOSE = /^[”’"'）)】」』\]]$/u;
const SOFT = /^[，、,：:\s]$/u;
const BEAT_LIMIT = 72;

const TABLE_RULE = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)*\|?\s*$/u;

export function speechText(body: string): string {
  const lines = plainMarkdown(body).split('\n');
  const spoken: string[] = [];
  let fenced = false;
  for (const [index, line] of lines.entries()) {
    if (/^\s*(?:```|~~~)/u.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced || TABLE_RULE.test(line)) continue;
    const row = /^\s*\|.*\|\s*$/u.test(line);
    if (row && TABLE_RULE.test(lines[index + 1] ?? '')) continue;
    spoken.push(
      row
        ? line
            .trim()
            .slice(1, -1)
            .split('|')
            .map((cell) => cell.trim())
            .filter(Boolean)
            .join(' · ')
        : line.replace(/^\s*(?:[-*+]|\d+[.)])\s+/u, ''),
    );
  }
  return spoken.join('\n').trim();
}

export function speechBeats(
  body: string,
  boundaries: readonly number[],
  limit = BEAT_LIMIT,
  minimum = 0,
): readonly number[] {
  const ends: number[] = [];
  const grapheme = (index: number): string =>
    index < boundaries.length - 1 ? body.slice(boundaries[index], boundaries[index + 1]) : '';
  let start = 0;
  let soft = -1;
  const close = (end: number): void => {
    if (body.slice(boundaries[start], boundaries[end]).trim()) {
      ends.push(boundaries[end]!);
      start = end;
    }
    soft = -1;
  };
  for (let index = 0; index < boundaries.length - 1; index++) {
    const current = grapheme(index);
    const next = grapheme(index + 1);
    const terminal = STOP.test(current) || (current === '.' && (next === '' || /^\s$/u.test(next)));
    if (terminal && !STOP.test(next) && !CLOSE.test(next) && next !== '.') close(index + 1);
    else if (
      CLOSE.test(current) &&
      (STOP.test(grapheme(index - 1)) || grapheme(index - 1) === '.') &&
      !CLOSE.test(next)
    )
      close(index + 1);
    else if (index + 1 - start >= limit) close(soft > start + limit / 2 ? soft : index + 1);
    const clock =
      /^[:：]$/u.test(current) && /^\d$/u.test(grapheme(index - 1)) && /^\d$/u.test(next);
    if (SOFT.test(current) && !clock) soft = index + 1;
  }
  const last = boundaries.at(-1) ?? 0;
  if (ends.at(-1) !== last) {
    if (ends.length && !body.slice(ends.at(-1), last).trim()) ends[ends.length - 1] = last;
    else ends.push(last);
  }
  if (!minimum) return ends;
  const length = (from: number, to: number) => [...body.slice(from, to).trim()].length;
  const merged: number[] = [];
  for (const [index, end] of ends.entries()) {
    const from = merged.at(-1) ?? 0;
    const after = ends[index + 1];
    const short = length(from, end) < minimum;
    if (short && after !== undefined && length(from, after) <= limit) continue;
    merged.push(end);
  }
  return merged;
}

export function beatStart(beats: readonly number[], shown: number): number {
  let start = 0;
  for (const end of beats) {
    if (end >= shown) break;
    start = end;
  }
  return start;
}

export function beatHold(text: string, last: boolean, waiting: boolean): number {
  const length = [...text.trim()].length;
  if (!last) return Math.min(3000, 900 + length * 30);
  return waiting ? 1500 + length * 30 : Math.max(2500, Math.min(8000, 1600 + length * 70));
}
