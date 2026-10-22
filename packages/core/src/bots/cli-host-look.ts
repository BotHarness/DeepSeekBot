import { CliLiveError } from './cli-live-error.js';

export const HOST_LOOK_COMMANDS = [
  { command: 'host-look', description: 'read or set device-local Host looks on --client-id and --host-id (--patch-stdin, --expected-revision)' },
] as const;

export async function runHostLook(
  rest: string[],
  values: { 'client-id'?: string; 'host-id'?: string; 'patch-stdin'?: boolean; 'expected-revision'?: string },
  io: { readStdin?: () => Promise<string> },
  connect: () => Promise<{ http(path: string, body?: Record<string, unknown>): Promise<{ bytes: Uint8Array }> }>,
) {
  if (rest.length || !values['client-id'] || !values['host-id'])
    throw new CliLiveError('usage', 'Select --client-id and --host-id for host-look.');
  if (!!values['patch-stdin'] !== (values['expected-revision'] !== undefined))
    throw new CliLiveError('usage', 'Writes require --patch-stdin and --expected-revision.');
  let patch: unknown;
  if (values['patch-stdin']) {
    try {
      patch = JSON.parse((await io.readStdin?.()) ?? '');
    } catch {
      throw new CliLiveError('invalid-input', 'Invalid Host look JSON on stdin.');
    }
  }
  const host = await connect();
  const result = await host.http('/api/botharness/appearance-control', {
    action: 'request',
    clientId: values['client-id'],
    hostLook: { hostId: values['host-id'], ...(patch === undefined ? {} : { patch }) },
    ...(patch === undefined ? {} : { expectedRevision: values['expected-revision'] }),
  });
  return JSON.parse(new TextDecoder().decode(result.bytes)) as unknown;
}
