import { CliLiveError } from './cli-live-error.js';

export const HOST_LOOK_COMMANDS = [
  {
    command: 'host-look',
    description:
      'read or set device-local Host looks on --client-id and --host-id (--refresh, --patch-stdin, --expected-revision)',
  },
] as const;

export async function runHostLook(
  rest: string[],
  values: {
    'client-id'?: string;
    'host-id'?: string;
    'patch-stdin'?: boolean;
    'expected-revision'?: string;
    refresh?: boolean;
  },
  io: { readStdin?: () => Promise<string> },
  connect: () => Promise<{
    http(path: string, body?: Record<string, unknown>): Promise<{ bytes: Uint8Array }>;
  }>,
  expiresAt: number,
) {
  if (rest.length || !values['client-id'] || !values['host-id'])
    throw new CliLiveError('usage', 'Select --client-id and --host-id for host-look.');
  if (!!values['patch-stdin'] !== (values['expected-revision'] !== undefined))
    throw new CliLiveError('usage', 'Writes require --patch-stdin and --expected-revision.');
  if (values.refresh && values['patch-stdin'])
    throw new CliLiveError('usage', 'Refresh reads the stored look; send writes separately.');
  const check = () => {
    if (!Number.isFinite(expiresAt) || Date.now() >= expiresAt)
      throw new CliLiveError(
        'appearance-request-stale',
        'The Host look request deadline has passed.',
      );
  };
  check();
  let patch: unknown;
  if (values['patch-stdin']) {
    try {
      patch = JSON.parse((await io.readStdin?.()) ?? '');
    } catch {
      throw new CliLiveError('invalid-input', 'Invalid Host look JSON on stdin.');
    }
  }
  check();
  const host = await connect();
  check();
  try {
    const result = await host.http('/api/botharness/appearance-control', {
      action: 'request',
      clientId: values['client-id'],
      expiresAt,
      hostLook: {
        hostId: values['host-id'],
        ...(values.refresh ? { refresh: true } : {}),
        ...(patch === undefined ? {} : { patch }),
      },
      ...(patch === undefined ? {} : { expectedRevision: values['expected-revision'] }),
    });
    return JSON.parse(new TextDecoder().decode(result.bytes)) as unknown;
  } catch (error) {
    if (
      patch !== undefined &&
      (!(error instanceof CliLiveError) ||
        [
          'host-unreachable',
          'host-protocol-error',
          'appearance-client-timeout',
          'appearance-client-stale',
          'appearance-request-stale',
        ].includes(error.code))
    )
      throw new CliLiveError(
        'host-look-outcome-unknown',
        'The write result is unknown. Read the same Client and Host before retrying; disconnecting does not cancel a delivered command before its deadline.',
      );
    throw error;
  }
}
