export const MAX_SPEAKABLE_CHARS = 2_000;

function hasHan(text: string): boolean {
  return /\p{Script=Han}/u.test(text);
}

function placeholder(han: boolean, kind: 'code' | 'table' | 'link' | 'path'): string {
  if (han)
    return {
      code: '（代码见文字）',
      table: '（表格见文字）',
      link: '链接',
      path: '文件路径',
    }[kind];
  return {
    code: '(code is in the text)',
    table: '(table is in the text)',
    link: 'a link',
    path: 'a file path',
  }[kind];
}

const INLINE_PATH =
  /^(?:~|\.{1,2})?(?:[\\/]?[\w.@+-]+)?(?:[\\/][\w.@+-]+)+[\\/]?$|^[A-Za-z]:\\[\w\\. -]+$/u;
const PATH =
  /(?:^|(?<=[\s(（"'“]))(?:(?:~|\.{1,2})?(?:[\\/][\w.@+-]+){2,}[\\/]?|[\w@+-][\w.@+-]*(?:\/[\w.@+-]+)*\/[\w@+-]+\.[A-Za-z][A-Za-z0-9]{0,7}\b|(?:[\w@+-][\w.@+-]*\/){2,}[\w.@+-]+)|[A-Za-z]:\\[\w\\. -]+/gu;
const URL_PATTERN = /\bhttps?:\/\/[^\s)）>\]]+/gu;

export function speakableText(markdown: string, maxChars = MAX_SPEAKABLE_CHARS): string {
  const han = hasHan(markdown);
  const lines = markdown.replace(/\r\n?/gu, '\n').split('\n');
  const out: string[] = [];
  let fence: string | undefined;
  let inTable = false;
  for (const raw of lines) {
    const line = raw.trimEnd();
    const fenceMatch = /^\s*(`{3,}|~{3,})/u.exec(line);
    if (fence !== undefined) {
      if (fenceMatch !== null && fenceMatch[1]!.startsWith(fence)) fence = undefined;
      continue;
    }
    if (fenceMatch !== null) {
      fence = fenceMatch[1]!;
      out.push(placeholder(han, 'code'));
      continue;
    }
    if (
      /^\s*\|.*\|\s*$/u.test(line) ||
      /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/u.test(line)
    ) {
      if (!inTable) out.push(placeholder(han, 'table'));
      inTable = true;
      continue;
    }
    inTable = false;
    if (/^ {4,}\S/u.test(raw) && out.at(-1) !== placeholder(han, 'code')) {
      out.push(placeholder(han, 'code'));
      continue;
    }
    if (/^ {4,}\S/u.test(raw)) continue;
    if (/^\s*([-*_])\s*(\1\s*){2,}$/u.test(line)) continue;
    let text = line
      .replace(/^\s{0,3}#{1,6}\s+/u, '')
      .replace(/^\s*>\s?/u, '')
      .replace(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/u, '')
      .replace(/!\[([^\]]*)\]\([^)]*\)/gu, '$1')
      .replace(/\[([^\]]+)\]\([^)]*\)/gu, '$1')
      .replace(/`([^`]+)`/gu, (_match, code: string) =>
        INLINE_PATH.test(code.trim())
          ? placeholder(han, 'path')
          : code.length <= 24 && !/[\\/{}();=<>]/u.test(code)
            ? code
            : placeholder(han, 'code'),
      )
      .replace(URL_PATTERN, placeholder(han, 'link'))
      .replace(PATH, placeholder(han, 'path'))
      .replace(/(\*\*|__)(.+?)\1/gu, '$2')
      .replace(/(^|[^\w*])[*_]([^*_\s][^*_]*?)[*_](?=[^\w*]|$)/gu, '$1$2')
      .replace(/~~(.+?)~~/gu, '$1')
      .replace(/<\/?[a-z][^>]*>/giu, '')
      .replace(/\s+/gu, ' ')
      .trim();
    if (text === '') continue;
    if (!/[.!?。！？…:：;；,，]$/u.test(text)) text += han ? '。' : '.';
    out.push(text);
  }
  const joined = out
    .filter((line, index) => index === 0 || line !== out[index - 1])
    .join(han ? '' : ' ')
    .trim();
  if (joined.length <= maxChars) return joined;
  const cut = joined.slice(0, maxChars);
  const end = Math.max(
    ...['。', '！', '？', '. ', '! ', '? '].map((mark) => cut.lastIndexOf(mark)),
  );
  return (end > maxChars / 2 ? cut.slice(0, end + 1) : cut).trim();
}
