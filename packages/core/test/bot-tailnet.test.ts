import { expect, it } from 'vitest';
import { TAILNET_REUSE_MS, createBotTailnet } from '../src/devices/bot-tailnet.js';

it('requires daemon-verified membership in this tailnet and a matching whois node', async () => {
  const peer = {
    ID: 'node-b',
    DNSName: 'mac.example.ts.net.',
    Online: true,
    TailscaleIPs: ['100.64.0.2'],
  };
  let whois = 'node-b';
  let clock = 0;
  const calls: string[] = [];
  const tailnet = createBotTailnet(
    async (args) => {
      calls.push(args[0]!);
      return args[0] === 'whois'
        ? { Node: { StableID: whois } }
        : {
            BackendState: 'Running',
            CurrentTailnet: { MagicDNSSuffix: 'example.ts.net' },
            Self: {
              ...peer,
              ID: 'node-a',
              DNSName: 'self.example.ts.net.',
              TailscaleIPs: ['100.64.0.1'],
            },
            Peer: {
              valid: peer,
              shared: {
                ...peer,
                ID: 'shared-node',
                DNSName: 'other.foreign.ts.net.',
                TailscaleIPs: ['100.64.0.3'],
              },
              disguised: {
                ...peer,
                ID: 'disguised',
                AltSharerUserID: 123,
                TailscaleIPs: ['100.64.0.4'],
              },
              lan: { ...peer, ID: 'lan', TailscaleIPs: ['192.168.1.5'] },
              offline: { ...peer, ID: 'offline', Online: false, TailscaleIPs: ['100.64.0.6'] },
              removed: {
                ...peer,
                ID: 'removed',
                InNetworkMap: false,
                TailscaleIPs: ['100.64.0.7'],
              },
            },
          };
    },
    () => clock,
  );
  expect((await tailnet.snapshot()).peers).toEqual([{ nodeId: 'node-b', address: '100.64.0.2' }]);
  expect((await tailnet.snapshot()).offlinePeers).toEqual([
    { nodeId: 'offline', address: '100.64.0.6' },
  ]);
  await expect(tailnet.admit('100.64.0.6')).rejects.toThrow('tailnet-peer-denied');
  expect(await tailnet.admit('100.64.0.2')).toEqual({ nodeId: 'node-b', address: '100.64.0.2' });
  for (const address of ['100.64.0.3', '100.64.0.4', '100.64.0.7', '192.168.1.5', '127.0.0.1'])
    await expect(tailnet.admit(address)).rejects.toThrow('tailnet-peer-denied');
  const before = calls.length;
  expect(await tailnet.admit('100.64.0.2')).toEqual({ nodeId: 'node-b', address: '100.64.0.2' });
  expect(calls.length).toBe(before);
  whois = 'different-node';
  clock += TAILNET_REUSE_MS;
  await expect(tailnet.admit('100.64.0.2')).rejects.toThrow('tailnet-peer-denied');
  expect(calls.slice(before)).toEqual(['status', 'whois']);
});
