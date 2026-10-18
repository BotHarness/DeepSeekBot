import { Lexer, type Token, type Tokens } from 'marked';

export function isMarkdownTable(token: Token): token is Tokens.Table {
  return (
    token.type === 'table' &&
    Array.isArray(token.header) &&
    Array.isArray(token.rows) &&
    Array.isArray(token.align)
  );
}

function inlineSupported(tokens: Token[]): boolean {
  return tokens.every((token) => {
    switch (token.type) {
      case 'escape':
      case 'codespan':
      case 'br':
        return true;
      case 'text':
        return (
          !token.text.includes('||') &&
          (token.tokens === undefined || inlineSupported(token.tokens))
        );
      case 'strong':
      case 'em':
      case 'del':
      case 'link':
        return inlineSupported(token.tokens ?? []);
      default:
        return false;
    }
  });
}

export function textMarkdownSupported(tokens: Token[]): boolean {
  return tokens.every((token) => {
    if (['space', 'hr', 'code', 'def', 'checkbox'].includes(token.type)) return true;
    if (token.type === 'paragraph' || token.type === 'heading' || token.type === 'text')
      return token.tokens === undefined || inlineSupported(token.tokens);
    if (token.type === 'blockquote')
      return !/^\[![A-Z]+\]/i.test(token.text) && textMarkdownSupported(token.tokens ?? []);
    if (token.type === 'list')
      return token.items.every((item: { tokens: Token[] }) => textMarkdownSupported(item.tokens));
    if (isMarkdownTable(token))
      return [token.header, ...token.rows].every((row) =>
        row.every((cell) => inlineSupported(cell.tokens)),
      );
    return false;
  });
}

export interface MarkdownBlock {
  key: number;
  source: string;
}

function parseBlocks(source: string, normalized: string) {
  const tokens = Lexer.lex(normalized, { gfm: true });
  if (
    Object.keys(tokens.links).length > 0 ||
    tokens.map((token) => token.raw).join('') !== normalized
  )
    return { blocks: [{ key: 0, source }], local: false };
  const blocks: MarkdownBlock[] = [];
  let offset = 0;
  let leading = '';
  for (const token of tokens) {
    if (token.type === 'space') {
      const previous = blocks.at(-1);
      if (previous === undefined) leading += token.raw;
      else previous.source += token.raw;
    } else {
      blocks.push({ key: offset - leading.length, source: leading + token.raw });
      leading = '';
    }
    offset += token.raw.length;
  }
  return { blocks, local: true };
}

export function markdownBlocks(source: string): MarkdownBlock[] {
  return parseBlocks(source, source.replace(/\r\n?/g, '\n')).blocks;
}

export function createMarkdownBlocks() {
  let previous = '';
  let normalized = '';
  let blocks: MarkdownBlock[] = [];
  let local = true;
  return (source: string): MarkdownBlock[] => {
    if (source === previous) return blocks;
    const next = source.replace(/\r\n?/g, '\n');
    const retained = local && next.startsWith(normalized) ? Math.max(0, blocks.length - 2) : 0;
    const offset = blocks[retained]?.key ?? 0;
    let parsed = parseBlocks(source.slice(offset), next.slice(offset));
    if (offset > 0 && !parsed.local) parsed = parseBlocks(source, next);
    else if (offset > 0)
      parsed.blocks = [
        ...blocks.slice(0, retained),
        ...parsed.blocks.map((block) => ({ key: block.key + offset, source: block.source })),
      ];
    previous = source;
    normalized = next;
    blocks = parsed.blocks;
    local = parsed.local;
    return blocks;
  };
}
