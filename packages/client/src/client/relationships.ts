import {
  relationshipReplySchema,
  relationshipInitiatedSchema,
  type ClientRelationship,
} from '../../../core/src/devices/relationship-contract.js';
export type { ClientRelationship } from '../../../core/src/devices/relationship-contract.js';
import { parsePairingLink } from '../../../../apps/mobile/src/host/pairing.js';
import { keyBytes } from '../../../../apps/mobile/src/host/encrypted-carrier.js';
import { noiseFingerprint } from '../../../core/src/devices/noise/xk.js';
import type { RemoteHosts, HostPairResult, RemotePairTrust } from './remote-hosts.js';

export async function relationshipRequest(
  body?: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<unknown> {
  const response = await fetch('./api/botharness/relationships', {
    method: body ? 'POST' : 'GET',
    credentials: 'include',
    ...(body
      ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
      : {}),
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(15_000)])
      : AbortSignal.timeout(15_000),
  });
  const value: unknown = await response.json();
  if (!response.ok) throw new Error('relationship-request-refused');
  return value;
}

export async function pairReciprocalHost(
  sources: RemoteHosts,
  link: string,
  name: string,
  localId?: string,
  trust?: RemotePairTrust,
): Promise<HostPairResult> {
  const parsed = parsePairingLink(link);
  if (!parsed.ok) return parsed;
  if (parsed.payload.host.id === localId) return { ok: false, code: 'this-host' };
  if (sources.getSnapshot().hosts.some(({ host }) => host.hostId === parsed.payload.host.id))
    return { ok: false, code: 'already-paired' };
  if (!parsed.payload.encryption) return { ok: false, code: 'host-key-required' };
  const fingerprint = noiseFingerprint(keyBytes(parsed.payload.encryption.publicKey));
  if (!(await trust?.confirmFingerprint?.(fingerprint, parsed.payload.host.name)))
    return { ok: false, code: 'cancelled' };
  let relationship: ClientRelationship | undefined;
  let saved = false;
  try {
    const initiation = await relationshipRequest({
      action: 'initiate',
      link,
      confirmedKey: parsed.payload.encryption.publicKey,
      confirm: true,
    });
    const initiated = relationshipInitiatedSchema.parse(initiation);
    relationship = initiated.relationship;
    trust?.onPending?.(noiseFingerprint(keyBytes(initiated.local.publicKey)));
    while (!trust?.signal?.aborted && relationship.state !== 'active') {
      await new Promise<void>((resolve) => {
        const done = () => {
          clearTimeout(timer);
          trust?.signal?.removeEventListener('abort', done);
          resolve();
        };
        const timer = setTimeout(done, 1500);
        trust?.signal?.addEventListener('abort', done, { once: true });
      });
      if (trust?.signal?.aborted) break;
      const response = await relationshipRequest(
        { action: 'sync', id: relationship.id },
        trust?.signal,
      );
      relationship = relationshipReplySchema.parse(response).relationship;
      if (
        relationship.state === 'disconnected' ||
        (relationship.state !== 'active' && relationship.expiresAt <= Date.now())
      )
        throw new Error('relationship-expired');
    }
    if (trust?.signal?.aborted) return { ok: false, code: 'cancelled' };
    const result = await sources.enrollRelationship(relationship.id, name, trust?.signal);
    saved = result.ok;
    return result;
  } catch {
    return { ok: false, code: trust?.signal?.aborted ? 'cancelled' : 'unreachable' };
  } finally {
    if (relationship && !saved)
      await relationshipRequest({ action: 'disconnect', id: relationship.id, confirm: true }).catch(
        () => {},
      );
  }
}
