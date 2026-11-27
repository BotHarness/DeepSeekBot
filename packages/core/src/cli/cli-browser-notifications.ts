import { CliLiveError } from './cli-live-error.js';

export const BROWSER_NOTIFICATION_COMMANDS = [
  {
    command: 'browser-notification-clients',
    description: 'list open Clients for browser notification preferences',
  },
  {
    command: 'browser-notifications',
    description:
      'read or set one Remote Host notification choice on --client-id (--remote-host-id, --patch-stdin, --expected-revision)',
  },
] as const;

export async function runBrowserNotifications(
  command: string,
  rest: string[],
  values: {
    'client-id'?: string;
    'remote-host-id'?: string;
    'patch-stdin'?: boolean;
    'expected-revision'?: string;
  },
  io: { readStdin?: () => Promise<string> },
  connect: () => Promise<{
    http(path: string, body?: Record<string, unknown>): Promise<{ bytes: Uint8Array }>;
  }>,
) {
  const list = command === 'browser-notification-clients';
  if (
    rest.length ||
    (list
      ? values['client-id'] ||
        values['remote-host-id'] ||
        values['patch-stdin'] ||
        values['expected-revision']
      : !values['client-id'] || !values['remote-host-id'])
  )
    throw new CliLiveError(
      'usage',
      'Select --client-id and --remote-host-id for browser-notifications.',
    );
  if (!!values['patch-stdin'] !== (values['expected-revision'] !== undefined))
    throw new CliLiveError('usage', 'Writes require --patch-stdin and --expected-revision.');
  let patch: unknown;
  if (values['patch-stdin']) {
    try {
      patch = JSON.parse((await io.readStdin?.()) ?? '');
    } catch {
      throw new CliLiveError('invalid-input', 'Invalid notification JSON on stdin.');
    }
  }
  const host = await connect();
  const result = await host.http(
    '/api/botharness/appearance-control',
    list
      ? undefined
      : {
          action: 'request',
          clientId: values['client-id'],
          notifications: {
            hostId: values['remote-host-id'],
            ...(patch === undefined ? {} : { patch }),
          },
          ...(patch === undefined ? {} : { expectedRevision: values['expected-revision'] }),
        },
  );
  return JSON.parse(new TextDecoder().decode(result.bytes)) as unknown;
}
