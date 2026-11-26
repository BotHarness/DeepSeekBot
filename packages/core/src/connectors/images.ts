const IMAGE_BYTES = 256 * 1024;
const IMAGE_TYPES = new Set([
  'image/svg+xml',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);
const SVG_PROLOG = /^\s*(?:(?:<\?xml[^>]*\?>|<!DOCTYPE svg[^>[]*>)\s*)*/i;
const UNSAFE_SVG =
  /<!|<\?|<script|<foreignObject|<image|<iframe|<use\b|\bon[a-z]+\s*=|(?:xlink:)?href\s*=\s*["'](?!#)|url\(\s*["']?(?!#)/i;

export function safeImageUrl(value: string): URL | undefined {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  return url.protocol === 'https:' && url.username === '' && url.password === '' ? url : undefined;
}

export async function fetchImage(
  fetchImpl: typeof fetch,
  url: string,
  refuse?: string,
): Promise<string | undefined> {
  const response = await fetchImpl(url, {
    redirect: 'error',
    signal: AbortSignal.timeout(8_000),
  });
  const type = (response.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
  if (!response.ok || !IMAGE_TYPES.has(type)) return undefined;
  const declared = Number(response.headers.get('content-length') ?? '0');
  if (declared > IMAGE_BYTES) return undefined;
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0 || bytes.length > IMAGE_BYTES) return undefined;
  if (type !== 'image/svg+xml') return `data:${type};base64,${bytes.toString('base64')}`;
  const svg = bytes
    .toString('utf8')
    .replace(/\s+/g, ' ')
    .replace(/<!--.*?-->/g, '')
    .replace(SVG_PROLOG, '')
    .trim();
  if (
    !/^<svg[\s>]/i.test(svg) ||
    UNSAFE_SVG.test(svg) ||
    (refuse !== undefined && svg.includes(refuse))
  )
    return undefined;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
