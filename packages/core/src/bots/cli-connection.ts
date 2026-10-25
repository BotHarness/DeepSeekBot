import { readFile } from 'node:fs/promises';
import { CliLiveError } from './cli-live-error.js';

export const CONNECTION_COMMANDS = [
  { command: 'connection-clients', description: 'list online Clients for Remote Host connection' },
  {
    command: 'connection',
    description:
      'start/status/confirm/cancel a connection on --client-id with --connection-id; start reads --link-file (- for stdin)',
  },
] as const;

export async function runConnectionCommand(
  command: string,
  rest: string[],
  values: {
    'client-id'?: string;
    'connection-id'?: string;
    'link-file'?: string;
    fingerprint?: string;
    confirm?: boolean;
  },
  io: { readStdin?: () => Promise<string> },
  connect: () => Promise<{
    http(path: string, body?: Record<string, unknown>): Promise<{ bytes: Uint8Array }>;
  }>,
) {
  const list = command === 'connection-clients';
  const action = rest[0];
  if (
    list
      ? rest.length > 0 || Object.values(values).some((value) => value !== undefined)
      : rest.length !== 1 ||
        !['start', 'status', 'confirm', 'cancel'].includes(action ?? '') ||
        !values['client-id'] ||
        !values['connection-id']
  )
    throw new CliLiveError(
      'usage',
      'Select --client-id and --connection-id, with start, status, confirm or cancel.',
    );
  if (
    !list &&
    ((action === 'start') !== (values['link-file'] !== undefined) ||
      (action === 'confirm'
        ? !values.confirm || !values.fingerprint
        : values.confirm || values.fingerprint))
  )
    throw new CliLiveError(
      'usage',
      'Start requires --link-file; confirm requires --fingerprint and --confirm.',
    );
  let link: string | undefined;
  if (values['link-file']) {
    try {
      link = (
        values['link-file'] === '-'
          ? ((await io.readStdin?.()) ?? '')
          : await readFile(values['link-file'], 'utf8')
      ).trim();
    } catch {
      throw new CliLiveError('connection-link-unreadable', 'Cannot read the private link file.');
    }
    if (!link || link.length > 3200)
      throw new CliLiveError('connection-link-invalid', 'Invalid private link.');
  }
  const host = await connect();
  const result = await host.http(
    '/api/botharness/appearance-control',
    list
      ? undefined
      : {
          action: 'request',
          clientId: values['client-id'],
          connection: {
            action,
            attemptId: values['connection-id'],
            ...(link === undefined ? {} : { link }),
            ...(action === 'confirm' ? { fingerprint: values.fingerprint, confirm: true } : {}),
          },
        },
  );
  return JSON.parse(new TextDecoder().decode(result.bytes)) as unknown;
}
