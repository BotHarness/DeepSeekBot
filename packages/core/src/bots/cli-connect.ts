import { CliLiveError } from './cli-live-error.js';
export const CONNECT_COMMANDS = [
  {
    command: 'private-connect',
    description: 'claim a Docker relay: --hostname <https-origin> --token-stdin --confirm',
  },
  {
    command: 'private-tunnel-enable',
    description:
      'publish only the encrypted device channel through cloudflared: --quick, or --hostname <name> --token-stdin; --confirm',
  },
  {
    command: 'private-tunnel-disable',
    description:
      'stop the private tunnel and forget its connector token and phone admission (--confirm)',
  },
  {
    command: 'private-ingress-enable',
    description:
      'use your own HTTPS reverse proxy or tunnel: --origin <https-origin> [--lan] --confirm',
  },
  {
    command: 'private-ingress-disable',
    description: 'stop accepting the custom ingress and forget its phone admission (--confirm)',
  },
  {
    command: 'connect-status',
    description: 'read Tobs Connect state, shared tunnel pool, queue position and the phone routes',
  },
  {
    command: 'connect-enable',
    description: 'run a Tobs Connect tunnel for --hostname with its connector token from stdin',
  },
  {
    command: 'connect-disable',
    description:
      'stop a Connect tunnel set up with connect-enable and forget its token; refused while the Host is signed in, where connect-sign-out stops the account tunnel',
  },
  {
    command: 'connect-sign-in',
    description:
      'sign this Host in to a WorkOS account so the relay provisions its tunnel (--wait)',
  },
  {
    command: 'connect-sign-out',
    description: 'unlink this Host from its account, stop the tunnel and forget the session',
  },
  {
    command: 'connect-account-hosts',
    description: 'list computers linked to the current Connect account',
  },
  {
    command: 'connect-account-revoke',
    description: 'sign out another linked computer by host ID (--confirm)',
  },
] as const;
export const CONNECT_OPTIONS = {
  hostname: { type: 'string' },
  'token-stdin': { type: 'boolean' },
  wait: { type: 'boolean' },
  quick: { type: 'boolean' },
  origin: { type: 'string' },
  lan: { type: 'boolean' },
} as const;
const DEVICES = '/api/botharness/devices';
export function isConnectCommand(command: string): boolean {
  return CONNECT_COMMANDS.some((entry) => entry.command === command);
}
export async function runConnectCommand(
  command: string,
  rest: string[],
  values: {
    hostname?: string;
    'token-stdin'?: boolean;
    wait?: boolean;
    confirm?: boolean;
    quick?: boolean;
    origin?: string;
    lan?: boolean;
  },
  io: { readStdin?: () => Promise<string>; stderr?: (text: string) => void },
  connect: () => Promise<{
    http(path: string, body?: Record<string, unknown>): Promise<{ bytes: Uint8Array }>;
  }>,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((done) => setTimeout(done, ms)),
): Promise<unknown> {
  if (command === 'private-ingress-enable' || command === 'private-ingress-disable') {
    const enable = command === 'private-ingress-enable';
    if (
      rest.length ||
      !values.confirm ||
      values.wait ||
      values.quick ||
      values.hostname !== undefined ||
      values['token-stdin'] ||
      (enable ? !values.origin : values.origin !== undefined || values.lan)
    )
      throw new CliLiveError(
        'usage',
        enable
          ? 'private-ingress-enable requires --origin <https-origin> and --confirm; add --lan to accept a proxy on another LAN machine.'
          : 'private-ingress-disable requires --confirm.',
      );
    const host = await connect();
    const response = await host.http(
      DEVICES + '/private-tunnel',
      enable
        ? {
            action: 'enable',
            mode: 'ingress',
            origin: values.origin,
            ...(values.lan ? { lan: true } : {}),
            confirm: true,
          }
        : { action: 'disable', confirm: true },
    );
    return JSON.parse(new TextDecoder().decode(response.bytes)) as unknown;
  }
  if (command === 'private-tunnel-enable' || command === 'private-tunnel-disable') {
    const enable = command === 'private-tunnel-enable';
    const quick = values.quick === true;
    const named = values.hostname !== undefined || values['token-stdin'] === true;
    if (
      rest.length ||
      !values.confirm ||
      values.wait ||
      (enable
        ? quick === named || (named && (!values.hostname || !values['token-stdin']))
        : quick || named)
    )
      throw new CliLiveError(
        'usage',
        enable
          ? 'private-tunnel-enable requires --quick, or --hostname <name> --token-stdin, and --confirm.'
          : 'private-tunnel-disable requires --confirm.',
      );
    let token: string | undefined;
    if (named) {
      token = (await (io.readStdin?.() ?? Promise.resolve(''))).trim();
      if (!token)
        throw new CliLiveError('usage', 'Read the Named Tunnel connector token from stdin.');
    }
    const host = await connect();
    const response = await host.http(DEVICES + '/private-tunnel', {
      action: enable ? 'enable' : 'disable',
      ...(enable ? { mode: quick ? 'quick' : 'named' } : {}),
      ...(named ? { hostname: values.hostname, token } : {}),
      confirm: true,
    });
    return JSON.parse(new TextDecoder().decode(response.bytes)) as unknown;
  }
  if (command === 'private-connect') {
    if (rest.length || !values.hostname || !values['token-stdin'] || !values.confirm || values.wait)
      throw new CliLiveError(
        'usage',
        'private-connect requires --hostname <https-origin> --token-stdin --confirm.',
      );
    const bootstrap = (await (io.readStdin?.() ?? Promise.resolve(''))).trim();
    if (!/^[a-f0-9]{64}$/u.test(bootstrap))
      throw new CliLiveError('usage', 'Read the initial setup key from stdin.');
    const host = await connect();
    const response = await host.http(DEVICES + '/private', {
      origin: values.hostname,
      bootstrap,
      confirm: true,
    });
    return JSON.parse(new TextDecoder().decode(response.bytes)) as unknown;
  }
  const enable = command === 'connect-enable';
  const revoke = command === 'connect-account-revoke';
  if (revoke ? rest.length !== 1 : rest.length !== 0)
    throw new CliLiveError(
      'usage',
      revoke ? `${command} requires one host ID.` : `${command} takes no positional arguments.`,
    );
  if (revoke && !values.confirm)
    throw new CliLiveError('confirm-required', 'Signing out another computer requires --confirm.');
  if (values.wait && command !== 'connect-sign-in')
    throw new CliLiveError('usage', '--wait requires connect-sign-in.');
  if (!enable && (values.hostname !== undefined || values['token-stdin']))
    throw new CliLiveError('usage', '--hostname and --token-stdin require connect-enable.');
  let token = '';
  if (enable) {
    if (!values.hostname || !values['token-stdin'])
      throw new CliLiveError('usage', 'connect-enable requires --hostname and --token-stdin.');
    token = (await (io.readStdin?.() ?? Promise.resolve(''))).trim();
    if (token === '') throw new CliLiveError('usage', 'Pipe the connector token through stdin.');
  }
  const host = await connect();
  const decode = (bytes: Uint8Array) => JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  if (command === 'connect-account-hosts')
    return decode((await host.http('/api/botharness/devices/account-hosts')).bytes);
  if (revoke)
    return decode(
      (
        await host.http('/api/botharness/devices/account-hosts/revoke', {
          hostId: rest[0],
          confirm: true,
        })
      ).bytes,
    );
  if (command === 'connect-status') {
    const snapshot = decode((await host.http(DEVICES)).bytes) as Record<string, unknown>;
    return { connect: snapshot['connect'], routes: snapshot['routes'] };
  }
  if (command === 'connect-sign-in' || command === 'connect-sign-out') {
    const started = decode(
      (
        await host.http(`${DEVICES}/connect`, {
          action: command === 'connect-sign-in' ? 'sign-in' : 'sign-out',
        })
      ).bytes,
    ) as Record<string, unknown>;
    if (!values.wait || started['state'] !== 'signing-in') return started;
    io.stderr?.(
      `Open ${String(started['verificationUri'])} and confirm code ${String(started['userCode'])}\n` +
        'To use a different account, open the link in a private window.\n',
    );
    const deadline = Date.parse(String(started['expiresAt'])) || Date.now() + 300_000;
    for (;;) {
      await sleep(3_000);
      const snapshot = decode((await host.http(DEVICES)).bytes) as {
        connect?: { account?: Record<string, unknown> };
      };
      const account = snapshot.connect?.account;
      if (account?.['state'] !== 'signing-in' || Date.now() > deadline) {
        if (account?.['state'] === 'signed-in' && typeof account['email'] === 'string')
          io.stderr?.(
            `Signed in as ${account['email']}. Not you? Run deepseekbot connect-sign-out.\n`,
          );
        return { connect: snapshot.connect };
      }
    }
  }
  return decode(
    (
      await host.http(
        `${DEVICES}/connect`,
        enable ? { action: 'enable', hostname: values.hostname, token } : { action: 'disable' },
      )
    ).bytes,
  );
}
