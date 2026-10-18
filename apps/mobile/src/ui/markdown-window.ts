import { Lexer } from 'marked';
import { textMarkdownSupported, type MarkdownBlock } from './markdown-blocks';

export type MarkdownViewport = { top: number; height: number };
export type MarkdownWindowPart =
  | { kind: 'block'; block: MarkdownBlock; index: number }
  | { kind: 'space'; key: number; height: number };

export function createMarkdownWindow() {
  const measured = new Map<number, { source: string; trailing: boolean; height: number }>();
  const supported = new Map<number, { source: string; supported: boolean }>();
  const fixed = (block: MarkdownBlock) => {
    const known = supported.get(block.key);
    if (known?.source === block.source) return known.supported;
    const result = textMarkdownSupported(Lexer.lex(block.source, { gfm: true }));
    supported.set(block.key, { source: block.source, supported: result });
    return result;
  };
  return {
    measure(block: MarkdownBlock, trailing: boolean, height: number): boolean {
      if (!trailing || !Number.isFinite(height) || height < 0) return false;
      const previous = measured.get(block.key);
      if (
        previous?.source === block.source &&
        previous.trailing === trailing &&
        previous.height === height
      )
        return false;
      if (!fixed(block)) return false;
      measured.set(block.key, { source: block.source, trailing, height });
      return true;
    },
    project(blocks: MarkdownBlock[], viewport?: MarkdownViewport): MarkdownWindowPart[] {
      if (
        blocks.length < 2 ||
        viewport === undefined ||
        !Number.isFinite(viewport.top) ||
        !(viewport.height > 0) ||
        !blocks.slice(0, -1).every(fixed)
      )
        return blocks.map((block, index) => ({ kind: 'block', block, index }));
      const start = Math.max(0, viewport.top - viewport.height * 2);
      const end = viewport.top + viewport.height * 3;
      const parts: MarkdownWindowPart[] = [];
      let offset = 0;
      let certain = true;
      for (const [index, block] of blocks.entries()) {
        const known = measured.get(block.key);
        const valid =
          known?.source === block.source && known.trailing === index < blocks.length - 1;
        if (!valid) certain = false;
        const height = known?.height ?? 0;
        if (certain && index < blocks.length - 1 && (offset + height < start || offset > end)) {
          const previous = parts.at(-1);
          if (previous?.kind === 'space') previous.height += height;
          else parts.push({ kind: 'space', key: block.key, height });
        } else parts.push({ kind: 'block', block, index });
        offset += height;
      }
      return parts;
    },
  };
}
