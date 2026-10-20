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
] as const;
export const CONNECT_OPTIONS = {
  hostname: { type: 'string' },
  'token-stdin': { type: 'boolean' },
} as const;
const DEVICES = '/api/botharness/devices';
export function isConnectCommand(command: string): boolean {
  return CONNECT_COMMANDS.some((entry) => entry.command === command);
}
export async function runConnectCommand(
  command: string,
  rest: string[],
  values: { hostname?: string; 'token-stdin'?: boolean },
  io: { readStdin?: () => Promise<string> },
  connect: () => Promise<{
    http(path: string, body?: Record<string, unknown>): Promise<{ bytes: Uint8Array }>;
  }>,
): Promise<unknown> {
  const enable = command === 'connect-enable';
  if (rest.length) throw new CliLiveError('usage', `${command} takes no positional arguments.`);
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
  return decode(
    (
      await host.http(
        `${DEVICES}/connect`,
        enable ? { action: 'enable', hostname: values.hostname, token } : { action: 'disable' },
      )
    ).bytes,
  );
}
