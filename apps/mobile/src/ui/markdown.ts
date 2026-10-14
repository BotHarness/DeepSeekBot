export type Inline =
  | { type: 'text'; text: string }
  | { type: 'code'; text: string }
  | { type: 'strong' | 'em' | 'del'; children: Inline[] }
  | { type: 'link'; href: string; children: Inline[] }
  | { type: 'break' };

export type Block =
  | { type: 'paragraph'; children: Inline[] }
  | { type: 'heading'; level: number; children: Inline[] }
  | { type: 'code'; language?: string; text: string }
  | { type: 'quote'; children: Block[] }
  | { type: 'list'; ordered: boolean; start: number; items: Block[][] }
  | { type: 'table'; text: string }
  | { type: 'rule' };

const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([^`\s]*)[^`]*$/u;
const HEADING = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/u;
const RULE = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/u;
const QUOTE = /^ {0,3}>\s?/u;
const ITEM = /^( {0,3})([-*+]|\d{1,9}[.)])\s+(.*)$/u;
const TABLE = /^\s*\|.*\|\s*$/u;

function startsBlock(line: string): boolean {
  return (
    FENCE.test(line) ||
    HEADING.test(line) ||
    RULE.test(line) ||
    QUOTE.test(line) ||
    ITEM.test(line) ||
    TABLE.test(line)
  );
}

export function parseMarkdown(source: string): Block[] {
  return parseBlocks(source.replace(/\r\n?/gu, '\n').split('\n'));
}

export interface MarkdownStream {
  source: string;
  frozenLength: number;
  frozen: Block[];
  blocks: Block[];
}

export function streamMarkdown(input: string, previous?: MarkdownStream): MarkdownStream {
  const source = input.replace(/\r\n?/gu, '\n');
  const reuse =
    previous !== undefined && source.startsWith(previous.source.slice(0, previous.frozenLength));
  let frozenLength = reuse ? previous.frozenLength : 0;
  let frozen = reuse ? previous.frozen : [];
  const lines = source.slice(frozenLength).split('\n');
  const starts: number[] = [];
  const tail = parseBlocks(lines, starts);
  let cut = 0;
  for (let block = starts.length - 1; block > 0; block -= 1) {
    const line = starts[block]!;
    if (
      line < lines.length - 1 &&
      lines[line - 1]!.trim() === '' &&
      !/^\s/u.test(lines[line]!) &&
      !ITEM.test(lines[line]!)
    ) {
      cut = block;
      break;
    }
  }
  if (cut > 0) {
    frozen = [...frozen, ...tail.slice(0, cut)];
    for (let line = 0; line < starts[cut]!; line += 1) frozenLength += lines[line]!.length + 1;
  }
  return { source, frozenLength, frozen, blocks: [...frozen, ...tail.slice(cut)] };
}

function parseBlocks(lines: string[], starts?: number[]): Block[] {
  const blocks: Block[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index]!;
    if (line.trim() === '') {
      index += 1;
      continue;
    }
    starts?.push(index);
    const fence = FENCE.exec(line);
    if (fence !== null) {
      const marker = fence[1]!;
      const body: string[] = [];
      index += 1;
      while (index < lines.length) {
        const next = lines[index]!;
        const close = /^ {0,3}(`{3,}|~{3,})\s*$/u.exec(next)?.[1];
        if (close !== undefined && close[0] === marker[0] && close.length >= marker.length) {
          index += 1;
          break;
        }
        body.push(next);
        index += 1;
      }
      blocks.push({
        type: 'code',
        ...(fence[2] ? { language: fence[2] } : {}),
        text: body.join('\n'),
      });
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading !== null) {
      blocks.push({
        type: 'heading',
        level: heading[1]!.length,
        children: parseInline(heading[2]!),
      });
      index += 1;
      continue;
    }
    if (RULE.test(line)) {
      blocks.push({ type: 'rule' });
      index += 1;
      continue;
    }
    if (QUOTE.test(line)) {
      const body: string[] = [];
      while (index < lines.length && QUOTE.test(lines[index]!)) {
        body.push(lines[index]!.replace(QUOTE, ''));
        index += 1;
      }
      blocks.push({ type: 'quote', children: parseBlocks(body) });
      continue;
    }
    if (TABLE.test(line)) {
      const rows: string[] = [];
      while (index < lines.length && TABLE.test(lines[index]!)) {
        rows.push(lines[index]!.trim());
        index += 1;
      }
      blocks.push({ type: 'table', text: rows.join('\n') });
      continue;
    }
    const item = ITEM.exec(line);
    if (item !== null) {
      const ordered = /\d/u.test(item[2]!);
      const start = ordered ? Number.parseInt(item[2]!, 10) : 1;
      const items: Block[][] = [];
      while (index < lines.length) {
        const current = ITEM.exec(lines[index]!);
        if (current === null || /\d/u.test(current[2]!) !== ordered) break;
        const indent = current[1]!.length + current[2]!.length + 1;
        const body = [current[3]!];
        index += 1;
        while (index < lines.length) {
          const next = lines[index]!;
          if (next.trim() === '') {
            const after = lines[index + 1];
            if (after !== undefined && /^\s{2,}\S/u.test(after)) {
              body.push('');
              index += 1;
              continue;
            }
            break;
          }
          if (/^\s+\S/u.test(next)) {
            body.push(next.replace(new RegExp(`^ {0,${Math.max(indent, 2)}}`, 'u'), ''));
            index += 1;
            continue;
          }
          if (startsBlock(next)) break;
          body.push(next);
          index += 1;
        }
        items.push(parseBlocks(body));
        while (index < lines.length && lines[index]!.trim() === '') {
          const after = lines[index + 1];
          if (after === undefined || ITEM.exec(after) === null) break;
          index += 1;
        }
      }
      blocks.push({ type: 'list', ordered, start, items });
      continue;
    }
    const paragraph: string[] = [];
    while (index < lines.length) {
      const next = lines[index]!;
      if (next.trim() === '' || (paragraph.length > 0 && startsBlock(next))) break;
      paragraph.push(next.trim());
      index += 1;
    }
    blocks.push({ type: 'paragraph', children: parseInline(paragraph.join('\n')) });
  }
  return blocks;
}

const SAFE_LINK = /^(https?:\/\/|mailto:)/iu;

export function safeHref(href: string): string | undefined {
  const value = href.trim();
  return SAFE_LINK.test(value) ? value : undefined;
}

export function parseInline(source: string): Inline[] {
  const out: Inline[] = [];
  let text = '';
  const flush = (): void => {
    if (text) out.push({ type: 'text', text });
    text = '';
  };
  let index = 0;
  while (index < source.length) {
    const rest = source.slice(index);
    const char = source[index]!;
    if (
      char === '\\' &&
      index + 1 < source.length &&
      /[\\`*_{}[\]()#+\-.!~|>]/u.test(source[index + 1]!)
    ) {
      text += source[index + 1];
      index += 2;
      continue;
    }
    if (char === '\n') {
      flush();
      out.push({ type: 'break' });
      index += 1;
      continue;
    }
    if (char === '`') {
      const ticks = /^`+/u.exec(rest)![0];
      const end = source.indexOf(ticks, index + ticks.length);
      if (end > 0) {
        flush();
        out.push({ type: 'code', text: source.slice(index + ticks.length, end).trim() || ' ' });
        index = end + ticks.length;
        continue;
      }
    }
    if (char === '[') {
      const link = /^\[([^\]\n]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/u.exec(rest);
      if (link !== null) {
        const href = safeHref(link[2]!);
        flush();
        if (href === undefined) out.push(...parseInline(link[1]!));
        else out.push({ type: 'link', href, children: parseInline(link[1]!) });
        index += link[0].length;
        continue;
      }
    }
    if (char === '<') {
      const auto = /^<((?:https?:\/\/|mailto:)[^>\s]+)>/iu.exec(rest);
      if (auto !== null) {
        flush();
        out.push({ type: 'link', href: auto[1]!, children: [{ type: 'text', text: auto[1]! }] });
        index += auto[0].length;
        continue;
      }
    }
    if (
      (char === 'h' || char === 'H') &&
      /^https?:\/\//iu.test(rest) &&
      !/\w/u.test(source[index - 1] ?? '')
    ) {
      const bare = /^https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"]/iu.exec(rest);
      if (bare !== null) {
        flush();
        out.push({ type: 'link', href: bare[0], children: [{ type: 'text', text: bare[0] }] });
        index += bare[0].length;
        continue;
      }
    }
    const span = /^(\*\*|__|~~|\*|_)/u.exec(rest);
    if (span !== null) {
      const marker = span[1]!;
      const intraword = marker[0] === '_' && /\w/u.test(source[index - 1] ?? '');
      const close = intraword ? -1 : findClose(source, index + marker.length, marker);
      if (close > index + marker.length) {
        flush();
        const type = marker === '~~' ? 'del' : marker.length === 2 ? 'strong' : 'em';
        out.push({ type, children: parseInline(source.slice(index + marker.length, close)) });
        index = close + marker.length;
        continue;
      }
    }
    text += char;
    index += 1;
  }
  flush();
  return out;
}

function findClose(source: string, from: number, marker: string): number {
  if (/\s/u.test(source[from] ?? ' ')) return -1;
  let index = from;
  while (index < source.length) {
    const found = source.indexOf(marker, index);
    if (found < 0) return -1;
    const before = source[found - 1] ?? '';
    const after = source[found + marker.length] ?? '';
    const single = marker.length === 1;
    if (
      !/\s/u.test(before) &&
      !(single && after === marker) &&
      !(single && before === marker) &&
      !(marker[0] === '_' && /\w/u.test(after))
    )
      return found;
    index = found + marker.length;
  }
  return -1;
}

export function inlineText(nodes: readonly Inline[]): string {
  return nodes
    .map((node) =>
      node.type === 'text' || node.type === 'code'
        ? node.text
        : node.type === 'break'
          ? '\n'
          : inlineText(node.children),
    )
    .join('');
}
