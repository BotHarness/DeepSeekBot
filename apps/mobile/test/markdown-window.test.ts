import { describe, expect, it } from 'vitest';
import { markdownBlocks } from '../src/ui/markdown-blocks';
import { createMarkdownWindow } from '../src/ui/markdown-window';

const body = Array.from({ length: 100 }, (_, i) => `Paragraph ${i}.\n\n`).join('');
const blocks = markdownBlocks(body);
const measured = () => {
  const window = createMarkdownWindow();
  blocks.forEach((block, i) => window.measure(block, i < blocks.length - 1, 20.25));
  return window;
};

describe('Markdown viewport projection', () => {
  it('retains native media blocks whose layout can change after loading', () => {
    const window = createMarkdownWindow();
    const media = markdownBlocks('![alt](https://example.com/image.png)');
    expect(window.measure(media[0]!, false, 100)).toBe(false);
    expect(window.project(media, { top: 2000, height: 100 })).toEqual([
      { kind: 'block', block: media[0], index: 0 },
    ]);
    const mixed = markdownBlocks(body + '![alt](https://example.com/image.png)\n\nFollowing text');
    expect(measured().project(mixed, { top: 1700, height: 100 })).toHaveLength(mixed.length);
  });
  it('bounds mounted blocks while retaining the exact document height', () => {
    const parts = measured().project(blocks, { top: 1700, height: 100 });
    const visible = parts.filter((part) => part.kind === 'block');
    expect(visible.length).toBeLessThan(30);
    expect(visible.length).toBeGreaterThan(0);
    expect(
      parts.reduce((sum, part) => sum + (part.kind === 'space' ? part.height : 20.25), 0),
    ).toBe(2025);
  });

  it('restores the original blocks when scrolling back through older text', () => {
    const window = measured();
    window.project(blocks, { top: 1700, height: 100 });
    const parts = window.project(blocks, { top: 0, height: 100 });
    expect(parts[0]).toEqual({ kind: 'block', block: blocks[0], index: 0 });
    const shown = parts.flatMap((part) => (part.kind === 'block' ? [part.block.source] : []));
    expect(shown.join('')).toContain('Paragraph 0.');
    expect(shown.join('')).toContain('Paragraph 10.');
    expect(shown.join('')).not.toContain('Paragraph 50.');
    expect(shown.join('')).toContain('Paragraph 99.');
  });

  it('always lays out appended text and invalidates a changed former tail margin', () => {
    const next = markdownBlocks(body + 'Next paragraph');
    const parts = measured().project(next, { top: 0, height: 100 });
    expect(parts).toContainEqual({ kind: 'block', block: next.at(-1), index: 100 });
    expect(parts).toContainEqual({ kind: 'block', block: next[99], index: 99 });
  });

  it('keeps changed or unmeasured content mounted until its new height is known', () => {
    const window = measured();
    const changed = blocks.map((block, i) =>
      i === 10 ? { ...block, source: 'Different height\n\n' } : block,
    );
    const parts = window.project(changed, { top: 1700, height: 100 });
    expect(parts).toContainEqual({ kind: 'block', block: changed[10], index: 10 });
    expect(parts.filter((part) => part.kind === 'block').length).toBeGreaterThanOrEqual(90);
    window.measure(changed[10]!, true, 40);
    expect(
      window.project(changed, { top: 1700, height: 100 }).filter((part) => part.kind === 'block')
        .length,
    ).toBeLessThan(30);
  });

  it('renders the full document before measurement or without a valid viewport', () => {
    expect(createMarkdownWindow().project(blocks, { top: 1700, height: 100 })).toHaveLength(100);
    expect(measured().project(blocks)).toHaveLength(100);
    expect(measured().project(blocks, { top: 0, height: 0 })).toHaveLength(100);
  });
});
