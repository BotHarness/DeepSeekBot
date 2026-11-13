import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { CliLiveError } from './cli-live-error.js';
import { nodeDeviceCarrier } from '../devices/node-carrier.js';
import { enrollRelationshipClient } from '../devices/relationship-enrollment.js';
import { serializeSavedHost } from '../../../../apps/mobile/src/host/hosts.js';
import { revokePairing } from '../../../../apps/mobile/src/host/pairing.js';

export const RELATIONSHIP_COMMANDS = [
  {
    command: 'relationships',
    description:
      'list, initiate, approve, sync, enroll or disconnect reciprocal Hosts; independent device keys stay in private files',
  },
] as const;
const PATH = '/api/botharness/relationships';
export async function runRelationshipCommand(
  rest: string[],
  values: {
    confirm?: boolean;
    'link-file'?: string;
    out?: string;
  },
  connect: () => Promise<{
    http(path: string, body?: Record<string, unknown>): Promise<{ bytes: Uint8Array }>;
  }>,
) {
  const [action, id, publicKey] = rest;
  if (!action || !['list', 'initiate', 'approve', 'sync', 'enroll', 'disconnect'].includes(action))
    throw new CliLiveError(
      'usage',
      'relationships takes list, initiate <public-key>, approve <id> <public-key>, sync <id>, enroll <id>, or disconnect <id>.',
    );
  if (rest.length !== (action === 'list' ? 1 : action === 'approve' ? 3 : 2))
    throw new CliLiveError('usage', 'Invalid relationship arguments.');
  if (['initiate', 'approve', 'disconnect'].includes(action) && values.confirm !== true)
    throw new CliLiveError(
      'confirm-required',
      'Confirm the named reciprocal relationship with --confirm.',
    );
  if (action !== 'list' && action !== 'initiate' && !/^[A-Za-z0-9_-]{32}$/u.test(id!))
    throw new CliLiveError('usage', 'Invalid relationship ID.');
  if (
    (action === 'initiate' || action === 'approve') &&
    !/^[0-9a-f]{64}$/u.test(action === 'initiate' ? id! : publicKey!)
  )
    throw new CliLiveError('usage', 'Compare the full Host identity and supply its public key.');
  if ((action === 'initiate') !== (values['link-file'] !== undefined))
    throw new CliLiveError('usage', 'Only initiate requires --link-file.');
  if ((action === 'enroll') !== (values.out !== undefined))
    throw new CliLiveError('usage', 'Only enroll requires --out.');
  if (values.out && (!isAbsolute(values.out) || existsSync(values.out)))
    throw new CliLiveError('output-invalid', 'Choose a new absolute private --out file.');
  let link: string | undefined;
  if (values['link-file']) {
    try {
      link = readFileSync(values['link-file'], 'utf8').trim();
    } catch {
      throw new CliLiveError('input-unavailable', 'Cannot read the pairing link file.');
    }
  }
  const host = await connect();
  const request = async (body?: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const response = await host.http(PATH, body);
    const parsed: unknown = JSON.parse(new TextDecoder().decode(response.bytes));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new CliLiveError('host-protocol-error', 'Expected a Host response object.');
    return parsed as Record<string, unknown>;
  };
  if (action === 'list') return request();
  if (action === 'enroll') {
    const result = await enrollRelationshipClient({
      relationshipId: id!,
      name: 'CLI desktop',
      carrier: nodeDeviceCarrier(),
      request,
    });
    if (!result.ok) throw new CliLiveError(result.code, 'Relationship device enrollment refused.');
    try {
      writeFileSync(values.out!, `${JSON.stringify(serializeSavedHost(result.host))}\n`, {
        flag: 'wx',
        mode: 0o600,
      });
    } catch {
      const cleanup = await revokePairing({ host: result.host, carrier: nodeDeviceCarrier() });
      throw new CliLiveError(
        'output-unavailable',
        cleanup === 'revoked'
          ? 'The private file could not be written; the issued device grant was revoked.'
          : `The private file could not be written; revoke device ${result.host.deviceId} on its Host.`,
      );
    }
    return { hostId: result.host.hostId, deviceId: result.host.deviceId, encrypted: true };
  }
  if (action === 'initiate') return request({ action, link, confirmedKey: id, confirm: true });
  return request({
    action,
    id,
    ...(action === 'approve'
      ? { confirmedKey: publicKey, confirm: true }
      : action === 'disconnect'
        ? { confirm: true }
        : {}),
  });
}
