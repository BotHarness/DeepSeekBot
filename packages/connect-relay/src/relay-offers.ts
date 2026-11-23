import { validName, type HostRow } from './relay-host.js';
import { failure, json, readBody } from './relay-http.js';
import { hmac } from './relay-signatures.js';
import type { RelayOptions } from './relay.js';

const VERIFIER_HASH = /^[A-Za-z0-9_-]{43}$/u;
const OFFER_TIMEOUT_MS = 10_000;
export const OFFER_PATH = '/botharness-device/channel';
export const SIGNATURE_HEADER = 'x-botharness-relay-signature';

interface OfferHandlerOptions {
  options: Pick<RelayOptions, 'hostKey' | 'fetchHost'>;
  now(): Date;
  touch(id: string, at: number): Promise<void>;
  hostname(row: Pick<HostRow, 'id' | 'zone' | 'label'>): string;
}

export function createOfferHandler({ options, now, touch, hostname }: OfferHandlerOptions) {
  return async function requestOffer(row: HostRow, account: string, request: Request) {
    if (options.hostKey === undefined) return failure(503, 'offer-unavailable');
    const body = await readBody(request);
    const verifierHash = body?.['verifierHash'];
    if (typeof verifierHash !== 'string' || !VERIFIER_HASH.test(verifierHash))
      return failure(400, 'invalid-verifier');
    const name = body?.['name'];
    if (name !== undefined && !validName(name)) return failure(400, 'invalid-device-name');
    await touch(row.id, now().getTime());
    if (row.tunnel_id === null) return failure(409, 'host-offline', 'no-tunnel');
    const payload = JSON.stringify({
      hostId: row.id,
      account,
      verifierHash,
      ...(name === undefined ? {} : { name: name.trim() }),
      issuedAt: now().toISOString(),
    });
    const signature = await hmac(await options.hostKey(row.id), payload);
    if (body?.['identitySource'] === 'client')
      return json(200, {
        identitySource: 'client',
        enrollment: { body: payload, signature },
        expiresAt: new Date(now().getTime() + 5 * 60 * 1000).toISOString(),
        hostname: hostname(row),
      });
    let reply: Response;
    try {
      reply = await (options.fetchHost ?? fetch)(`https://${hostname(row)}${OFFER_PATH}`, {
        method: 'GET',
        redirect: 'error',
        signal: AbortSignal.timeout(OFFER_TIMEOUT_MS),
      });
    } catch (error) {
      return failure(
        409,
        'host-offline',
        (error as { name?: unknown } | null)?.name === 'TimeoutError' ? 'timeout' : 'unreachable',
      );
    }
    if (reply.status >= 500) return failure(409, 'host-offline', `http-${reply.status}`);
    const answer = (await reply.json().catch(() => undefined)) as
      | {
          encryption?: { protocol?: unknown; publicKey?: unknown };
          host?: { id?: unknown; name?: unknown };
          signIn?: { password?: unknown };
        }
      | undefined;
    if (
      reply.status !== 200 ||
      answer?.encryption?.protocol !== 'connect-noise-xk-v1' ||
      typeof answer.encryption.publicKey !== 'string' ||
      !/^[0-9a-f]{64}$/u.test(answer.encryption.publicKey) ||
      typeof answer.host?.id !== 'string' ||
      typeof answer.host.name !== 'string'
    )
      return failure(
        502,
        'host-refused',
        reply.status === 200 ? 'bad-offer' : `http-${reply.status}`,
      );
    return json(200, {
      enrollment: { body: payload, signature },
      encryption: answer.encryption,
      expiresAt: new Date(now().getTime() + 5 * 60 * 1000).toISOString(),
      hostname: hostname(row),
      host: { id: answer.host.id, name: answer.host.name },
      ...(typeof answer.signIn?.password === 'boolean'
        ? { signIn: { password: answer.signIn.password } }
        : {}),
    });
  };
}
