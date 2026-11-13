import { readFile } from 'node:fs/promises';
import { CliLiveError } from './cli-live-error.js';

export const CONNECTION_COMMANDS = [
  {
    command: 'connection-hosts',
    description: 'list paired Hosts and observed routes on --client-id',
  },
  {
    command: 'connection-host',
    description:
      '<host-id> inspect/read-operation/remove/revoke-device/stop-route/sign-out/test-route/select-route on --client-id; plan-* previews writes; mutations require --confirm; self-disconnection requires --handover <origin> or --confirm-disconnect',
  },
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
    'confirm-disconnect'?: boolean;
    handover?: string;
    'connection-route-id'?: string;
  },
  io: { readStdin?: () => Promise<string> },
  connect: () => Promise<{
    http(path: string, body?: Record<string, unknown>): Promise<{ bytes: Uint8Array }>;
  }>,
) {
  if (command === 'connection-hosts' || command === 'connection-host') {
    const listHosts = command === 'connection-hosts';
    const [hostId, operation, argument] = rest;
    const actions: Record<string, string> = {
      inspect: 'inspect-host',
      remove: 'forget-host',
      'revoke-device': 'revoke-device',
      'stop-route': 'stop-route',
      'test-route': 'test-route',
      'select-route': 'select-route',
      'sign-out': 'sign-out',
      'read-operation': 'read-operation',
      'read-previous-operation': 'read-previous-operation',
      'plan-stop-route': 'stop-route',
      'plan-revoke-device': 'revoke-device',
      'plan-sign-out': 'sign-out',
    };
    const action = listHosts
      ? 'hosts'
      : Object.hasOwn(actions, operation ?? '')
        ? actions[operation!]
        : undefined;
    const planning = operation?.startsWith('plan-') === true;
    const mutating =
      !planning &&
      ['forget-host', 'revoke-device', 'stop-route', 'select-route', 'sign-out'].includes(
        action ?? '',
      );
    const extra = ['revoke-device', 'stop-route', 'test-route', 'select-route'].includes(
      action ?? '',
    );
    if (
      !values['client-id'] ||
      values['connection-id'] ||
      values['link-file'] ||
      values.fingerprint ||
      !action ||
      (listHosts ? rest.length !== 0 : !hostId || rest.length !== (extra ? 3 : 2)) ||
      (mutating ? values.confirm !== true : values.confirm === true) ||
      ((!mutating || !['stop-route', 'revoke-device', 'sign-out'].includes(action ?? '')) &&
        (values.handover !== undefined || values['confirm-disconnect'])) ||
      (values.handover !== undefined && values['confirm-disconnect']) ||
      (values['connection-route-id'] !== undefined &&
        (action !== 'stop-route' ||
          argument !== 'private-tunnel' ||
          !['quick', 'custom'].includes(values['connection-route-id'])))
    )
      throw new CliLiveError(
        'usage',
        'Select --client-id and a Host operation; mutations require --confirm.',
      );
    if (action === 'stop-route' && !['lan', 'private-tunnel'].includes(argument ?? ''))
      throw new CliLiveError('usage', 'Stop route requires lan or private-tunnel.');
    if (action === 'stop-route' && argument === 'private-tunnel' && !values['connection-route-id'])
      throw new CliLiveError(
        'usage',
        'Select one owned private route with --connection-route-id quick or custom.',
      );
    const target = {
      action,
      ...(action === 'revoke-device' ? { deviceId: argument } : {}),
      ...(action === 'stop-route'
        ? {
            kind: argument,
            ...(values['connection-route-id'] ? { routeId: values['connection-route-id'] } : {}),
          }
        : {}),
    };
    const host = await connect();
    const result = await host.http('/api/botharness/appearance-control', {
      action: 'request',
      clientId: values['client-id'],
      connection: {
        ...(planning ? { action: 'plan-operation', operation: target } : target),
        ...(listHosts ? {} : { hostId }),
        ...(mutating ? { confirm: true } : {}),
        ...(values.handover === undefined ? {} : { handover: values.handover }),
        ...(values['confirm-disconnect'] ? { confirmDisconnect: true } : {}),
        ...(['test-route', 'select-route'].includes(action) ? { route: argument } : {}),
      },
    });
    return JSON.parse(new TextDecoder().decode(result.bytes)) as unknown;
  }
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
