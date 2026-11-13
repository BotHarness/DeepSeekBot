import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { CliLiveError } from './cli-live-error.js';
import { nodeDeviceCarrier } from '../devices/node-carrier.js';
import { enrollRelationshipClient } from '../devices/relationship-enrollment.js';
import { serializeSavedHost } from '../../../../apps/mobile/src/host/hosts.js';
import { revokePairing } from '../../../../apps/mobile/src/host/pairing.js';
import { relationshipListSchema } from '../devices/relationship-contract.js';

export const RELATIONSHIP_COMMANDS = [
  {
    command: 'relationships',
    description:
      'list, initiate, approve, sync, route, enroll or disconnect reciprocal Hosts; independent device keys stay in private files',
  },
] as const;
const PATH = '/api/botharness/relationships';
export async function runRelationshipCommand(
  rest: string[],
  values: {
    confirm?: boolean;
    'link-file'?: string;
    out?: string;
    'device-name'?: string;
  },
  connect: () => Promise<{
    http(path: string, body?: Record<string, unknown>): Promise<{ bytes: Uint8Array }>;
  }>,
  signal?: AbortSignal,
) {
  const deadline = () => {
    if (signal?.aborted)
      throw new CliLiveError(
        'timeout',
        'Relationship command deadline expired; inspect its state before retrying.',
      );
  };
  const [action, id, publicKey] = rest;
  if (
    !action ||
    !['list', 'initiate', 'approve', 'sync', 'route', 'enroll', 'disconnect'].includes(action)
  )
    throw new CliLiveError(
      'usage',
      'relationships takes list, initiate <public-key>, approve <id> <public-key>, sync <id>, route <id> --link-file <file>, enroll <id>, or disconnect <id>.',
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
  if (['initiate', 'route'].includes(action) !== (values['link-file'] !== undefined))
    throw new CliLiveError('usage', 'Initiate and route require --link-file.');
  if ((action === 'enroll') !== (values.out !== undefined))
    throw new CliLiveError('usage', 'Only enroll requires --out.');
  if (
    values['device-name'] !== undefined &&
    (action !== 'enroll' ||
      !values['device-name'].trim() ||
      values['device-name'].trim().length > 60)
  )
    throw new CliLiveError('usage', 'Only enroll accepts --device-name (1–60 characters).');
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
  deadline();
  const host = await connect();
  deadline();
  const request = async (body?: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const response = await host.http(PATH, body);
    deadline();
    const parsed: unknown = JSON.parse(new TextDecoder().decode(response.bytes));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new CliLiveError('host-protocol-error', 'Expected a Host response object.');
    return parsed as Record<string, unknown>;
  };
  if (action === 'list') return request();
  if (action === 'enroll') {
    const relationship = relationshipListSchema
      .parse(await request())
      .relationships.find((item) => item.id === id);
    if (!relationship || relationship.state !== 'active')
      throw new CliLiveError('relationship-inactive', 'Choose an active relationship.');
    const result = await enrollRelationshipClient({
      relationshipId: id!,
      expectedPeer: relationship.peer,
      name: values['device-name']?.trim() ?? 'CLI desktop',
      carrier: nodeDeviceCarrier(),
      request,
      ...(signal ? { signal } : {}),
    });
    if (!result.ok) throw new CliLiveError(result.code, 'Relationship device enrollment refused.');
    if (signal?.aborted) {
      await revokePairing({ host: result.host, carrier: nodeDeviceCarrier() });
      deadline();
    }
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
  if (action === 'route') return request({ action, id, link });
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
