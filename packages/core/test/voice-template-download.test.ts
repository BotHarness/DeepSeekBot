import { lookup, type LookupAddress, type LookupOptions } from 'node:dns';
import { createServer } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { publicAudioLookup } from '../src/voice/template-download.js';
import { templateAudio } from '../src/voice/template-response.js';

const dns = vi.hoisted(() => {
  const addresses: LookupAddress[] = [];
  return { addresses };
});

vi.mock('node:dns', () => ({
  lookup: vi.fn(
    (
      _hostname: string,
      _options: LookupOptions,
      callback: (error: Error | null, addresses: LookupAddress[]) => void,
    ) => callback(null, dns.addresses),
  ),
}));

afterEach(() => vi.clearAllMocks());

function resolveTo(addresses: LookupAddress[]) {
  dns.addresses = addresses;
}

const privateAddresses = [
  '0.0.0.0',
  '10.1.2.3',
  '100.100.100.200',
  '127.0.0.1',
  '169.254.169.254',
  '172.16.2.3',
  '192.168.1.1',
  '224.0.0.1',
  '::',
  '::1',
  'fe80::1',
  'fc00::1',
  'fec0::1',
  '::ffff:127.0.0.1',
  '::ffff:10.1.2.3',
  '2002:7f00:1::',
];

describe('response-supplied audio destinations', () => {
  it.each(privateAddresses)(
    'refuses literal non-public destination %s before fetch',
    async (address) => {
      const download = vi.fn<typeof fetch>();
      const host = address.includes(':') ? `[${address}]` : address;
      await expect(
        templateAudio({
          response: Response.json({ audio: `http://${host}/audio` }),
          result: { kind: 'url', path: 'audio' },
          fetch: download,
          signal: AbortSignal.timeout(1_000),
        }),
      ).rejects.toMatchObject({ code: 'provider-bad-response' });
      expect(download).not.toHaveBeenCalled();
    },
  );

  it.each(privateAddresses)('refuses DNS answer %s in the connection lookup', async (address) => {
    resolveTo([{ address, family: address.includes(':') ? 6 : 4 }]);
    const answer = await new Promise<unknown>((resolve) => {
      publicAudioLookup('cdn.example', { all: true }, (error) => resolve(error));
    });
    expect(answer).toMatchObject({ code: 'provider-bad-response' });
  });

  it('rejects mixed public/private answers and permits public IPv4 and IPv6 CDN answers', async () => {
    const addresses = [
      { address: '93.184.216.34', family: 4 },
      { address: '2606:4700:4700::1111', family: 6 },
    ];
    resolveTo(addresses);
    const all = vi.fn();
    publicAudioLookup('cdn.example', { all: true }, all);
    expect(all).toHaveBeenCalledWith(null, addresses);
    const one = vi.fn();
    publicAudioLookup('cdn.example', {}, one);
    expect(one).toHaveBeenCalledWith(null, '93.184.216.34', 4);
    resolveTo([...addresses, { address: '127.0.0.1', family: 4 }]);
    const mixed = vi.fn();
    publicAudioLookup('cdn.example', { all: true }, mixed);
    expect(mixed.mock.calls[0]?.[0]).toMatchObject({ code: 'provider-bad-response' });
  });

  it('blocks a hostname resolving to loopback before any HTTP request reaches the server', async () => {
    let requests = 0;
    const server = createServer((_request, response) => {
      requests += 1;
      response.end('private upstream detail');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (address === null || typeof address === 'string') throw new Error('Missing port');
      resolveTo([{ address: '127.0.0.1', family: 4 }]);
      await expect(
        templateAudio({
          response: Response.json({ audio: `http://cdn.example:${address.port}/private` }),
          result: { kind: 'url', path: 'audio' },
          fetch,
          signal: AbortSignal.timeout(1_000),
        }),
      ).rejects.toThrow('fetch failed');
      expect(lookup).toHaveBeenCalled();
      expect(requests).toBe(0);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
