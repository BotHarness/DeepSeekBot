import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { createConnectAccount } from '../../../../apps/mobile/src/host/connect-account.js';
import { pairHost } from '../../../../apps/mobile/src/host/pairing.js';
import { parseSavedHost, serializeSavedHost } from '../../../../apps/mobile/src/host/hosts.js';
import { createHostClient } from '../../../../apps/mobile/src/host/client.js';
import { isLanRoute, isEncryptedRoute } from '../../../../apps/mobile/src/host/route.js';
import { nodeDeviceCarrier } from '../devices/node-carrier.js';
import { CliLiveError } from './cli-live-error.js';

export const DEVICE_CLIENT_COMMANDS = [
  {
    command: 'device-account-pair',
    description:
      'enroll --host-id through the account in a private --account-file --confirm; save keys to a new --out file',
  },
  {
    command: 'device-pair',
    description:
      'pair from a trusted --link-file --confirm; write keys only to a new private --out file',
  },
  {
    command: 'device-probe',
    description:
      'read the real Host Feed as a paired device using --device-file; prints only connection metadata',
  },
] as const;

export async function runDeviceClientCommand(
  command: string,
  rest: string[],
  values: {
    'link-file'?: string;
    'device-file'?: string;
    'account-file'?: string;
    'host-id'?: string;
    out?: string;
    confirm?: boolean;
  },
  writeStatus: (line: string) => void = (line) => {
    process.stderr.write(line);
  },
): Promise<unknown> {
  if (rest.length) throw new CliLiveError('usage', `${command} takes no positional arguments.`);
  if (command === 'device-pair' || command === 'device-account-pair') {
    const accountPair = command === 'device-account-pair';
    if (accountPair && (!values['account-file'] || !values['host-id']))
      throw new CliLiveError('usage', 'Provide --account-file and --host-id.');
    if ((!accountPair && !values['link-file']) || !values.out || !isAbsolute(values.out))
      throw new CliLiveError('usage', 'Provide --link-file and a new absolute --out file.');
    if (!values.confirm)
      throw new CliLiveError(
        'confirm-required',
        'Confirm this file came from the trusted computer with --confirm.',
      );
    if (existsSync(values.out)) throw new CliLiveError('output-exists', 'Choose a new --out file.');
    let text: Parameters<typeof pairHost>[0]['text'];
    try {
      if (accountPair) {
        const file = values['account-file']!;
        const account = createConnectAccount({
          ...(process.env['DEEPSEEKBOT_CONNECT_RELAY']
            ? { relay: process.env['DEEPSEEKBOT_CONNECT_RELAY'] }
            : {}),
          redirectUri: 'cli:/callback',
          runtime: {
            read: async () => readFileSync(file, 'utf8'),
            write: async (session) => {
              writeFileSync(file, session ?? '', { mode: 0o600 });
            },
            request: (url, init) =>
              fetch(url, { ...init, signal: init?.signal ?? AbortSignal.timeout(15_000) }),
            random: () => randomBytes(32).toString('base64url'),
            challenge: async (value) => createHash('sha256').update(value).digest('base64url'),
            authorize: async () => null,
            now: Date.now,
          },
        });
        text = async () => {
          const result = await account.offer(values['host-id']!, 'CLI device');
          return result.ok ? { ok: true, payload: result.value } : result;
        };
      } else text = readFileSync(values['link-file']!, 'utf8');
    } catch {
      throw new CliLiveError('invalid-input', 'Cannot read the trusted pairing file.');
    }
    let summary: unknown;
    let reported = false;
    const result = await pairHost({
      text,
      method: accountPair ? 'account' : 'paste',
      deviceName: 'CLI device',
      carrier: nodeDeviceCarrier(),
      confirmFingerprint: async () => true,
      onPending: (fingerprint) => {
        if (reported) return;
        reported = true;
        writeStatus(
          `${JSON.stringify({ type: 'device-key-confirmation-required', fingerprint })}\n`,
        );
      },
      telemetry: { pairing: () => ({ finish: () => {} }) },
      save: async (host) => {
        writeFileSync(values.out!, `${JSON.stringify(serializeSavedHost(host))}\n`, {
          flag: 'wx',
          mode: 0o600,
        });
        summary = {
          hostId: host.hostId,
          deviceId: host.deviceId,
          encrypted: !!host.encryption,
          pairing: { path: values.out },
        };
      },
    });
    if (!result.ok)
      throw new CliLiveError(
        result.code,
        accountPair
          ? 'Account pairing failed. Check the account session and the connection diagnostic before retrying.'
          : 'Device pairing refused. Approve the pending exact key on the trusted Host.',
      );
    return summary;
  }
  if (!values['device-file']) throw new CliLiveError('usage', 'Provide --device-file.');
  let host;
  try {
    host = parseSavedHost(JSON.parse(readFileSync(values['device-file'], 'utf8')));
  } catch {
    throw new CliLiveError('invalid-input', 'Cannot read the saved pairing.');
  }
  if (!host) throw new CliLiveError('invalid-input', 'Invalid saved pairing.');
  if (!host.encryption && host.routes.some((route) => isEncryptedRoute(route)))
    throw new CliLiveError('host-key-required', 'Upgrade this pairing from the trusted computer.');
  const client = createHostClient({ ...host, carrier: nodeDeviceCarrier() });
  let unsubscribe = () => {};
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await new Promise((resolve, reject) => {
      timer = setTimeout(
        () => reject(new CliLiveError('unreachable', 'Device Host Feed did not become ready.')),
        15_000,
      );
      unsubscribe = client.subscribe(() => {
        const snapshot = client.getSnapshot();
        if (snapshot.connection.status === 'connected' && snapshot.roster && snapshot.feedRead)
          resolve({
            hostId: host.hostId,
            deviceId: host.deviceId,
            feedRead: snapshot.feedRead,
            route: isLanRoute(snapshot.connection.route) ? 'lan' : 'remote',
            encrypted: isEncryptedRoute(snapshot.connection.route, host.encryption),
            bots: snapshot.roster.bots.length,
            channels: snapshot.roster.channels.length,
          });
        else if (snapshot.connection.status === 'refused')
          reject(new CliLiveError(snapshot.connection.code, 'Device access was refused.'));
      });
      client.start();
    });
  } finally {
    clearTimeout(timer);
    unsubscribe();
    client.stop();
  }
}
