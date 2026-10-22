import { existsSync, writeFileSync } from 'node:fs';

import { CliLiveError } from './cli-live-error.js';

export const DEVICES_COMMANDS = [
  {
    command: 'device-lan',
    description: 'enable --confirm or disable encrypted phone access on the local network',
  },
  {
    command: 'device-approve-key',
    description:
      'approve <receipt> <device-public-key> after fingerprint comparison (needs --confirm)',
  },
  {
    command: 'devices',
    description: 'list paired devices with this Host identity and its phone routes',
  },
  {
    command: 'device-offer',
    description:
      'open a pairing offer and write its link only to a new private --out file; prints a receipt',
  },
  {
    command: 'device-offer-status',
    description: 'show whether the offer behind a receipt is pending, redeemed or expired',
  },
  {
    command: 'device-revoke',
    description: 'revoke one paired device and close its open streams (needs --confirm)',
  },
] as const;

const DEVICES = '/api/botharness/devices';

const absolute = (value: string): boolean =>
  value.startsWith('/') || /^[A-Za-z]:[\\/]/u.test(value);

export function isDevicesCommand(command: string): boolean {
  return DEVICES_COMMANDS.some((entry) => entry.command === command);
}

export async function runDevicesCommand(
  command: string,
  rest: string[],
  values: { confirm?: boolean; out?: string },
  connect: () => Promise<{
    http(path: string, body?: Record<string, unknown>): Promise<{ bytes: Uint8Array }>;
  }>,
  write: (path: string, text: string) => void = (path, text) =>
    writeFileSync(path, `${text}\n`, { flag: 'wx', mode: 0o600 }),
  exists: (path: string) => boolean = existsSync,
): Promise<unknown> {
  const takes =
    command === 'device-approve-key'
      ? 2
      : command === 'device-offer-status' || command === 'device-revoke' || command === 'device-lan'
        ? 1
        : 0;
  if (rest.length !== takes)
    throw new CliLiveError(
      'usage',
      takes === 0
        ? `${command} takes no arguments.`
        : command === 'device-approve-key'
          ? 'device-approve-key takes <receipt> <public-key> --confirm.'
          : `${command} takes exactly one ${command === 'device-revoke' ? '<device-id>' : '<receipt>'}.`,
    );
  if (values.out !== undefined && command !== 'device-offer')
    throw new CliLiveError('usage', '--out requires device-offer.');
  if (command === 'device-lan') {
    if (rest[0] !== 'enable' && rest[0] !== 'disable')
      throw new CliLiveError('usage', 'device-lan takes enable --confirm or disable.');
    if (rest[0] === 'enable' && values.confirm !== true)
      throw new CliLiveError(
        'confirm-required',
        'LAN access opens an encrypted phone entry on this network. Pass --confirm.',
      );
  }
  if (command === 'device-offer') {
    if (values.out === undefined)
      throw new CliLiveError(
        'out-required',
        'device-offer writes the pairing link only to a file. Pass --out with a new absolute path, or show the QR code from Bot settings → Devices.',
      );
    if (!absolute(values.out))
      throw new CliLiveError('usage', '--out must be an absolute file path.');
    if (exists(values.out))
      throw new CliLiveError(
        'output-exists',
        'The output already exists; choose a new --out path.',
      );
  }
  if (command === 'device-revoke' && values.confirm !== true)
    throw new CliLiveError(
      'confirm-required',
      'device-revoke signs the device out at once and it must pair again. Pass --confirm.',
    );
  if (
    command === 'device-approve-key' &&
    (values.confirm !== true || !/^[0-9a-f]{64}$/u.test(rest[1] ?? ''))
  )
    throw new CliLiveError(
      'key-confirmation-required',
      'Compare the device fingerprint, then pass <receipt> <public-key> --confirm.',
    );
  const host = await connect();
  const decode = (bytes: Uint8Array): Record<string, unknown> => {
    try {
      const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
      if (typeof value === 'object' && value !== null && !Array.isArray(value))
        return value as Record<string, unknown>;
    } catch {}
    throw new CliLiveError('host-protocol-error', 'The Host did not return a JSON object.');
  };
  if (command === 'devices') {
    const snapshot = decode((await host.http(DEVICES)).bytes);
    return {
      host: snapshot['host'],
      devices: snapshot['devices'],
      ...(snapshot['pendingKeys'] === undefined ? {} : { pendingKeys: snapshot['pendingKeys'] }),
      routes: snapshot['routes'],
      ...(snapshot['lan'] === undefined ? {} : { lan: snapshot['lan'] }),
    };
  }
  if (command === 'device-lan')
    return decode(
      (await host.http(`${DEVICES}/lan`, { action: rest[0], confirm: values.confirm === true }))
        .bytes,
    );
  if (command === 'device-approve-key')
    return decode(
      (
        await host.http(`${DEVICES}/approve-key`, {
          receipt: rest[0],
          publicKey: rest[1],
          confirm: true,
        })
      ).bytes,
    );
  if (command === 'device-offer-status')
    return decode((await host.http(`${DEVICES}/offer-status`, { receipt: rest[0] })).bytes);
  if (command === 'device-revoke')
    return decode((await host.http(`${DEVICES}/revoke`, { deviceId: rest[0] })).bytes);
  const view = decode((await host.http(`${DEVICES}/offer`, {})).bytes);
  if (typeof view['link'] !== 'string' || typeof view['receipt'] !== 'string')
    throw new CliLiveError(
      'host-protocol-error',
      'The Host returned a pairing offer without a link and receipt; update the Host.',
    );
  const receipt = { receipt: view['receipt'], expiresAt: view['expiresAt'] };
  try {
    write(values.out!, view['link']);
  } catch (error) {
    const exists = error instanceof Error && 'code' in error && error.code === 'EEXIST';
    throw new CliLiveError(
      exists ? 'output-exists' : 'output-unavailable',
      `${
        exists
          ? 'The output already exists; choose a new --out path.'
          : 'Could not write the output file.'
      } Offer ${String(view['receipt'])} was opened but not delivered; it expires at ${String(view['expiresAt'])}.`,
    );
  }
  return {
    ...receipt,
    routes: view['routes'],
    reachable: view['reachable'],
    link: { path: values.out },
  };
}
