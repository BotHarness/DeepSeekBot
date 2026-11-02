import { Lexer } from 'marked';
import remend from 'remend';

import type { MarkdownBlock } from './markdown-blocks';

export function markdownBlockContent(block: MarkdownBlock, streaming: boolean) {
  const markdown = streaming ? remend(block.source) : block.source;
  const parsed = block.parsed;
  const tokens =
    markdown === block.source && parsed?.source === block.source
      ? parsed.tokens
      : Lexer.lex(markdown, { gfm: true });
  return { markdown, tokens };
}
