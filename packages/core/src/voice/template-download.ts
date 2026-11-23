import { lookup } from 'node:dns';
import { BlockList, isIP, type LookupFunction } from 'node:net';
import { Agent } from 'undici';
import { VoiceError } from './provider-types.js';

const blocked = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 3],
] satisfies [string, number][])
  blocked.addSubnet(address, prefix, 'ipv4');
blocked.addSubnet('2001::', 23, 'ipv6');
blocked.addSubnet('2001:db8::', 32, 'ipv6');
blocked.addSubnet('2002::', 16, 'ipv6');
const globalV6 = new BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');

function permitted(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !blocked.check(address, 'ipv4');
  return family === 6 && globalV6.check(address, 'ipv6') && !blocked.check(address, 'ipv6');
}

function denied(): VoiceError {
  return new VoiceError('provider-bad-response', 'The audio download destination is not public.');
}

export const publicAudioLookup: LookupFunction = (hostname, options, callback) => {
  lookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error, '', 4);
    const first = addresses[0];
    if (first === undefined || addresses.some(({ address }) => !permitted(address)))
      return callback(denied(), '', 4);
    if (options.all) callback(null, addresses);
    else callback(null, first.address, first.family);
  });
};

export async function withPublicAudioDownload<T>(
  url: URL,
  signal: AbortSignal,
  fetcher: typeof fetch,
  consume: (response: Response) => Promise<T>,
): Promise<T> {
  const hostname = url.hostname.replace(/^\[|\]$/gu, '');
  if (isIP(hostname) && !permitted(hostname)) throw denied();
  const dispatcher = new Agent({ connect: { lookup: publicAudioLookup } });
  try {
    const init: RequestInit & { dispatcher: Agent } = { signal, redirect: 'error', dispatcher };
    return await consume(await fetcher(url.href, init));
  } finally {
    await dispatcher.destroy();
  }
}
