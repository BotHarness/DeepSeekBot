import { existsSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { isAbsolute } from 'node:path';
import { CliLiveError } from './cli-live-error.js';
import { nodeDeviceCarrier } from '../devices/node-carrier.js';
import {
  enrollRelationshipClient,
  updateRelationshipClientRoute,
} from '../devices/relationship-enrollment.js';
import { serializeSavedHost, parseSavedHost } from '../../../../apps/mobile/src/host/hosts.js';
import { revokePairing, parsePairingLink } from '../../../../apps/mobile/src/host/pairing.js';
import {
  relationshipListSchema,
  relationshipReplySchema,
} from '../devices/relationship-contract.js';

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
    'device-file'?: string;
  },
  connect: () => Promise<{
    http(path: string, body?: Record<string, unknown>): Promise<{ bytes: Uint8Array }>;
  }>,
) {
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
  if (values['device-file'] && (action !== 'route' || !isAbsolute(values['device-file'])))
    throw new CliLiveError('usage', 'Only route accepts an existing absolute --device-file.');
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
  if (action === 'route') {
    const result = await request({ action, id, link });
    const deviceFile = values['device-file'];
    if (!deviceFile) return result;
    let saved: ReturnType<typeof parseSavedHost>;
    try {
      saved = parseSavedHost(JSON.parse(readFileSync(deviceFile, 'utf8')));
    } catch {
      throw new CliLiveError('input-unavailable', 'Cannot read the private device file.');
    }
    if (!saved) throw new CliLiveError('input-unavailable', 'The private device file is invalid.');
    const parsed = parsePairingLink(link!);
    if (!parsed.ok)
      throw new CliLiveError('relationship-link-invalid', 'The new connection link is invalid.');
    const { relationship } = relationshipReplySchema.parse(result);
    const privateRelay = parsed.payload.encryption?.privateRelay;
    const updated = updateRelationshipClientRoute({
      host: saved,
      peer: relationship.peer,
      ...(privateRelay ? { privateRelay } : {}),
    });
    if (!updated.ok)
      throw new CliLiveError(updated.code, 'The existing Client route was not changed.');
    const temporary = `${deviceFile}.route-${randomUUID()}.tmp`;
    try {
      writeFileSync(temporary, `${JSON.stringify(serializeSavedHost(updated.host))}\n`, {
        flag: 'wx',
        mode: 0o600,
      });
      renameSync(temporary, deviceFile);
    } catch {
      try {
        unlinkSync(temporary);
      } catch {}
      throw new CliLiveError(
        'output-unavailable',
        'The private device file was not replaced. Read back the relationship before retrying.',
      );
    }
    return {
      ...result,
      client: { hostId: updated.host.hostId, deviceId: updated.host.deviceId, updated: true },
    };
  }
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
