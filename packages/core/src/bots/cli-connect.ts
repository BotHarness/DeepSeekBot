import { CliLiveError } from './cli-live-error.js';
export const CONNECT_COMMANDS = [
  {
    command: 'connect-status',
    description: 'read hosted Connect state and the phone routes',
  },
  {
    command: 'connect-enable',
    description: 'run a Connect tunnel for --hostname with its connector token from stdin',
  },
  {
    command: 'connect-disable',
    description: 'stop the Connect tunnel and forget its token',
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
] as const;
export const CONNECT_OPTIONS = {
  hostname: { type: 'string' },
  'token-stdin': { type: 'boolean' },
  wait: { type: 'boolean' },
} as const;
const DEVICES = '/api/botharness/devices';
export function isConnectCommand(command: string): boolean {
  return CONNECT_COMMANDS.some((entry) => entry.command === command);
}
export async function runConnectCommand(
  command: string,
  rest: string[],
  values: { hostname?: string; 'token-stdin'?: boolean; wait?: boolean },
  io: { readStdin?: () => Promise<string>; stderr?: (text: string) => void },
  connect: () => Promise<{
    http(path: string, body?: Record<string, unknown>): Promise<{ bytes: Uint8Array }>;
  }>,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((done) => setTimeout(done, ms)),
): Promise<unknown> {
  const enable = command === 'connect-enable';
  if (rest.length) throw new CliLiveError('usage', `${command} takes no positional arguments.`);
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
      `Open ${String(started['verificationUri'])} and confirm code ${String(started['userCode'])}\n`,
    );
    const deadline = Date.parse(String(started['expiresAt'])) || Date.now() + 300_000;
    for (;;) {
      await sleep(3_000);
      const snapshot = decode((await host.http(DEVICES)).bytes) as {
        connect?: { account?: Record<string, unknown> };
      };
      const account = snapshot.connect?.account;
      if (account?.['state'] !== 'signing-in' || Date.now() > deadline)
        return { connect: snapshot.connect };
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
