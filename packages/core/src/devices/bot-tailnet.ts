import { execFile } from 'node:child_process';
import { isIP } from 'node:net';

export interface TailnetMember {
  nodeId: string;
  address: string;
}
export interface BotTailnet {
  snapshot(): Promise<{
    self: TailnetMember;
    peers: TailnetMember[];
    offlinePeers?: TailnetMember[];
  }>;
  admit(address: string): Promise<TailnetMember>;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

async function command(args: string[]): Promise<unknown> {
  const binaries =
    process.platform === 'darwin'
      ? ['tailscale', '/Applications/Tailscale.app/Contents/MacOS/Tailscale']
      : ['tailscale'];
  for (const binary of binaries) {
    try {
      return await new Promise<unknown>((resolve, reject) => {
        execFile(
          binary,
          args,
          { timeout: 3000, maxBuffer: 2 * 1024 * 1024, windowsHide: true },
          (error, stdout) => {
            if (error) {
              reject(error);
              return;
            }
            try {
              resolve(JSON.parse(stdout));
            } catch {
              reject(new Error('tailnet-state-invalid'));
            }
          },
        );
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        throw new Error('tailnet-unavailable');
    }
  }
  throw new Error('tailnet-unavailable');
}

export function createBotTailnet(run: (args: string[]) => Promise<unknown> = command): BotTailnet {
  async function snapshot() {
    const status = record(await run(['status', '--json']));
    const suffix = record(status['CurrentTailnet'])['MagicDNSSuffix'];
    if (status['BackendState'] !== 'Running' || typeof suffix !== 'string' || suffix.length === 0)
      throw new Error('tailnet-unavailable');
    const member = (value: unknown, online = true): TailnetMember | undefined => {
      const peer = record(value);
      const name = typeof peer['DNSName'] === 'string' ? peer['DNSName'].replace(/\.$/u, '') : '';
      if (
        !name.endsWith(`.${suffix}`) ||
        name.slice(0, -(suffix.length + 1)).includes('.') ||
        typeof peer['ID'] !== 'string' ||
        peer['Online'] !== online ||
        (peer['AltSharerUserID'] !== undefined && peer['AltSharerUserID'] !== 0)
      )
        return;
      const address = Array.isArray(peer['TailscaleIPs'])
        ? peer['TailscaleIPs'].find(
            (value: unknown) =>
              typeof value === 'string' &&
              isIP(value) === 4 &&
              /^100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./u.test(value),
          )
        : undefined;
      return typeof address === 'string' ? { nodeId: peer['ID'], address } : undefined;
    };
    const self = member(status['Self']);
    if (self === undefined) throw new Error('tailnet-unavailable');
    return {
      self,
      offlinePeers: Object.values(record(status['Peer']))
        .flatMap((peer) => {
          const found = member(peer, false);
          return found ? [found] : [];
        })
        .slice(0, 64),
      peers: Object.values(record(status['Peer']))
        .flatMap((peer) => {
          const found = member(peer);
          return found ? [found] : [];
        })
        .slice(0, 64),
    };
  }
  return {
    snapshot,
    async admit(rawAddress) {
      const address = rawAddress.replace(/^::ffff:/u, '');
      if (isIP(address) !== 4) throw new Error('tailnet-peer-denied');
      const current = await snapshot();
      const peer = [current.self, ...current.peers].find((peer) => peer.address === address);
      if (!peer) throw new Error('tailnet-peer-denied');
      const node = record(record(await run(['whois', '--json', address]))['Node']);
      if (node['StableID'] !== peer.nodeId) throw new Error('tailnet-peer-denied');
      return peer;
    },
  };
}
