import { createHmac, timingSafeEqual } from 'node:crypto';

import { checkRoute, isConnectRoute } from '@botharness/host-protocol/route';
import { z } from 'zod';

import {
  AccountError,
  REQUEST_TIMEOUT_MS,
  type createConnectAccountRequests,
  type RelayOperation,
} from './connect-account-requests.js';
import {
  accountRelationshipOfferSchema,
  connectedHostsSchema,
  type AccountRelationshipSession,
  type OfferVerification,
} from './connect-account-types.js';

const OFFER_FRESH_MS = 60_000;
const VERIFIER_HASH = /^[A-Za-z0-9_-]{43}$/u;
const signedOfferSchema = z.object({
  hostId: z.string(),
  account: z.string(),
  verifierHash: z.string().regex(VERIFIER_HASH),
  issuedAt: z.string(),
  name: z.string().optional(),
});

export function verifySignedOffer(
  {
    body,
    signature,
    relayKey,
    hostId,
    account,
  }: {
    body: string;
    signature: string;
    relayKey: string;
    hostId: string;
    account: string;
  },
  record: (phase: string, detail?: string) => void,
): OfferVerification {
  const expected = createHmac('sha256', relayKey).update(body).digest();
  const presented = Buffer.from(signature, 'base64url');
  if (presented.length !== expected.length || !timingSafeEqual(presented, expected)) {
    record('offer-refused', 'reason=signature');
    return { ok: false };
  }
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return { ok: false };
  }
  const parsed = signedOfferSchema.safeParse(payload);
  if (
    !parsed.success ||
    parsed.data.hostId !== hostId ||
    parsed.data.account !== account ||
    !(Math.abs(Date.now() - Date.parse(parsed.data.issuedAt)) <= OFFER_FRESH_MS)
  ) {
    record('offer-refused', 'reason=payload');
    return { ok: false };
  }
  record('offer-signed');
  const { verifierHash, name } = parsed.data;
  return {
    ok: true,
    verifierHash,
    ...(typeof name === 'string' ? { name } : {}),
    accountAutoApprove: true,
  };
}

export function createAccountRelationshipSession(
  options: Pick<
    AccountRelationshipSession,
    'accountId' | 'registrationId' | 'generation' | 'current'
  > &
    Pick<ReturnType<typeof createConnectAccountRequests>, 'relayCall' | 'requestError'> & {
      signal: AbortSignal;
      token: string;
      refreshToken: (signal: AbortSignal) => Promise<string>;
    },
): AccountRelationshipSession {
  const {
    accountId,
    registrationId,
    generation,
    signal: generationSignal,
    current,
    relayCall,
    requestError,
    refreshToken,
  } = options;
  let token = options.token;
  const request = async (
    operation: RelayOperation,
    method: string,
    path: string,
    caller: AbortSignal,
    body?: unknown,
  ) => {
    const signal = AbortSignal.any([caller, generationSignal]);
    const guard = () => {
      if (!current() || signal.aborted) throw new AccountError('session-expired');
    };
    const call = async () => {
      guard();
      try {
        return await relayCall(operation, method, path, token, body, REQUEST_TIMEOUT_MS, signal);
      } catch (error) {
        guard();
        throw error;
      }
    };
    let reply;
    try {
      reply = await call();
    } catch (error) {
      if (!(error instanceof AccountError) || error.issue !== 'session-expired') throw error;
      guard();
      token = await refreshToken(signal);
      guard();
      reply = await call();
    }
    guard();
    return reply;
  };
  return {
    accountId,
    registrationId,
    generation,
    signal: generationSignal,
    current,
    async hosts(signal: AbortSignal) {
      const reply = await request('list-hosts', 'GET', '/v1/hosts', signal);
      if (reply.status !== 200) throw new AccountError('relay-unavailable');
      const listed = connectedHostsSchema.parse(reply.body);
      if (listed.hosts.length > 256 || !listed.hosts.some((host) => host.id === registrationId))
        throw new AccountError('session-revoked');
      return listed.hosts.map(({ botNetwork, connected, ...host }) => ({
        ...host,
        current: host.id === registrationId,
        ...(botNetwork === undefined ? {} : { botNetwork }),
        ...(connected === undefined ? {} : { connected }),
      }));
    },
    async offer(peerRegistrationId: string, verifierHash: string, signal: AbortSignal) {
      if (!/^h[a-z2-7]{12}$/u.test(peerRegistrationId) || !VERIFIER_HASH.test(verifierHash))
        throw new AccountError('relay-unavailable');
      const reply = await request(
        'relationship-offer',
        'POST',
        `/v1/hosts/${peerRegistrationId}/offer`,
        signal,
        { verifierHash },
      );
      if (reply.status !== 200)
        throw requestError('relay', 'relationship-offer', {
          reason: 'http',
          status: reply.status,
        });
      const invalid = (validation: 'offer' | 'payload' | 'identity' | 'route' | 'freshness') =>
        requestError('relay', 'relationship-offer', {
          reason: 'invalid-response',
          status: reply.status,
          validation,
        });
      const parsed = accountRelationshipOfferSchema.safeParse(reply.body);
      if (!parsed.success) throw invalid('offer');
      const offered = parsed.data;
      const route = checkRoute(`https://${offered.hostname}`);
      let body: unknown;
      try {
        body = JSON.parse(offered.enrollment.body);
      } catch {
        throw invalid('payload');
      }
      const payload = z
        .object({
          hostId: z.literal(peerRegistrationId),
          account: z.literal(accountId),
          verifierHash: z.literal(verifierHash),
          issuedAt: z.iso.datetime(),
        })
        .safeParse(body);
      if (!payload.success) throw invalid('identity');
      if (
        !route.ok ||
        !isConnectRoute(route.origin) ||
        new URL(route.origin).hostname !== offered.hostname
      )
        throw invalid('route');
      if (
        Date.parse(offered.expiresAt) <= Date.now() ||
        Math.abs(Date.now() - Date.parse(payload.data.issuedAt)) > OFFER_FRESH_MS
      )
        throw invalid('freshness');
      return offered;
    },
  };
}
