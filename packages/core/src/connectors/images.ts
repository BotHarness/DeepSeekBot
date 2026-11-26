import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

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

const PRIVATE = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 3],
] as const)
  PRIVATE.addSubnet(network, prefix, 'ipv4');
for (const [network, prefix] of [
  ['::', 127],
  ['64:ff9b::', 96],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const)
  PRIVATE.addSubnet(network, prefix, 'ipv6');

export type HostLookup = (hostname: string) => Promise<ReadonlyArray<{ address: string }>>;

export const dnsLookup: HostLookup = (hostname) => lookup(hostname, { all: true });

function privateAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return true;
  return PRIVATE.check(address, family === 4 ? 'ipv4' : 'ipv6');
}

export async function publicDestination(url: URL, resolve: HostLookup): Promise<boolean> {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host) !== 0) return !privateAddress(host);
  if (host === 'localhost' || host.endsWith('.localhost') || !host.includes('.')) return false;
  let addresses: ReadonlyArray<{ address: string }>;
  try {
    addresses = await resolve(host);
  } catch {
    return false;
  }
  return addresses.length > 0 && addresses.every((entry) => !privateAddress(entry.address));
}

async function readLimited(response: Response): Promise<Buffer | undefined> {
  if (response.body === null) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > IMAGE_BYTES) {
      await reader.cancel().catch(() => undefined);
      return undefined;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
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
  const declared = Number(response.headers.get('content-length') ?? '0');
  if (!response.ok || !IMAGE_TYPES.has(type) || declared > IMAGE_BYTES) {
    await response.body?.cancel().catch(() => undefined);
    return undefined;
  }
  const bytes = await readLimited(response);
  if (bytes === undefined || bytes.length === 0) return undefined;
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
