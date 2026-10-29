export interface ReadmeSource {
  owner: string;
  name: string;
  ref: string;
  filesBase?: string;
  directory?: string;
}

const FENCE = /^( {0,3})(`{3,}|~{3,})/u;
const SCHEME = /^[a-z][a-z0-9+.-]*:/iu;
const SAFE_SCHEME = /^(https?|mailto):/iu;
const DROPPED_BLOCKS =
  /<(script|style|iframe|object|embed|template|noscript)\b[\s\S]*?<\/\1\s*>/giu;
const COMMENT = /<!--[\s\S]*?-->/gu;
const IMG_TAG = /<img\b([^>]*)>/giu;
const ANCHOR = /<a\b([^>]*)>([\s\S]*?)<\/a\s*>/giu;
const BREAK = /<br\s*\/?>/giu;
const ANY_TAG = /<\/?[a-z][a-z0-9-]*(?=[\s/>])[^>]*>/giu;
const INLINE_LINK =
  /(!?)\[((?:\\.|[^\]\\])*)\]\(\s*(<[^>]*>|(?:[^\s()]|\([^\s()]*\))+)(\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/gu;
const REFERENCE = /^( {0,3}\[(?:\\.|[^\]\\])+\]:\s*)(<[^>]*>|\S+)(.*)$/u;

function attribute(attributes: string, name: string): string | undefined {
  const match = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'iu').exec(
    attributes,
  );
  return match === null ? undefined : (match[2] ?? match[3] ?? match[4]);
}

function resolvePath(target: string): string {
  const parts: string[] = [];
  for (const part of target.replace(/^\/+/u, '').split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return parts.join('/');
}

export function rewriteUrl(
  raw: string,
  source: ReadmeSource,
  kind: 'image' | 'link',
): string | undefined {
  const url = raw.trim().replace(/^<|>$/gu, '');
  if (url.length === 0) return undefined;
  if (url.startsWith('#'))
    return source.filesBase === undefined
      ? `https://github.com/${source.owner}/${source.name}${url}`
      : undefined;
  if (url.startsWith('//')) return `https:${url}`;
  if (SCHEME.test(url)) return SAFE_SCHEME.test(url) ? url : undefined;
  const [pathPart = '', fragment] = url.split('#', 2);
  const relative = pathPart.split('?')[0] ?? '';
  const path = resolvePath(
    source.directory === undefined || relative.startsWith('/')
      ? relative
      : `${source.directory}/${relative}`,
  );
  const base =
    source.filesBase !== undefined
      ? source.filesBase
      : kind === 'image'
        ? `https://raw.githubusercontent.com/${source.owner}/${source.name}/${source.ref}`
        : `https://github.com/${source.owner}/${source.name}/blob/${source.ref}`;
  return `${base}/${path}${fragment === undefined ? '' : `#${fragment}`}`;
}

function escapeText(text: string): string {
  return text.replace(/[[\]]/gu, '\\$&');
}

function stripHtml(text: string, source: ReadmeSource): string {
  return text
    .replace(COMMENT, '')
    .replace(DROPPED_BLOCKS, '')
    .replace(IMG_TAG, (_, attributes: string) => {
      const src = attribute(attributes, 'src');
      const url = src === undefined ? undefined : rewriteUrl(src, source, 'image');
      if (url === undefined) return '';
      return `![${escapeText(attribute(attributes, 'alt') ?? '')}](\u0001${url}\u0002)`;
    })
    .replace(ANCHOR, (_, attributes: string, inner: string) => {
      const href = attribute(attributes, 'href');
      const url = href === undefined ? undefined : rewriteUrl(href, source, 'link');
      const text = inner.replace(ANY_TAG, '').trim();
      return url === undefined || text.length === 0 ? text : `[${text}](\u0001${url}\u0002)`;
    })
    .replace(BREAK, '\n')
    .replace(ANY_TAG, '')
    .replace(/\u0001/gu, '<')
    .replace(/\u0002/gu, '>');
}

function rewriteLine(line: string, source: ReadmeSource): string {
  const reference = REFERENCE.exec(line);
  if (reference !== null) {
    const url = rewriteUrl(reference[2] ?? '', source, 'link');
    return url === undefined ? '' : `${reference[1]}<${url}>${reference[3]}`;
  }
  const code = [...line.matchAll(/`+[^`]*`+/gu)].map((match) => [
    match.index,
    match.index + match[0].length,
  ]);
  return line.replace(
    INLINE_LINK,
    (
      match: string,
      bang: string,
      text: string,
      target: string,
      title: string | undefined,
      offset: number,
    ) => {
      if (code.some(([from = 0, to = 0]) => offset >= from && offset < to)) return match;
      const url = rewriteUrl(target, source, bang === '!' ? 'image' : 'link');
      if (url === undefined) return bang === '!' ? '' : text;
      return `${bang}[${text}](<${url}>${title ?? ''})`;
    },
  );
}

export function prepareReadme(markdown: string, source: ReadmeSource): string {
  const output: string[] = [];
  let prose: string[] = [];
  let fence: string | undefined;
  const flush = () => {
    if (prose.length === 0) return;
    for (const line of stripHtml(prose.join('\n'), source).split('\n')) {
      output.push(rewriteLine(line, source));
    }
    prose = [];
  };
  for (const line of markdown.replace(/\r\n?/gu, '\n').split('\n')) {
    const marker = FENCE.exec(line)?.[2];
    if (fence !== undefined) {
      output.push(line);
      if (marker !== undefined && marker[0] === fence[0] && marker.length >= fence.length) {
        fence = undefined;
      }
      continue;
    }
    if (marker !== undefined) {
      flush();
      fence = marker;
      output.push(line);
      continue;
    }
    prose.push(line);
  }
  flush();
  return output
    .join('\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}
