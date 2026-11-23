import type { HostCarrier } from '@botharness/host-protocol/carrier';
import {
  teamRecord,
  type TeamHostIdentity,
  type TeamResult,
} from '@botharness/host-protocol/team-invitation';
import type { HostEncryption } from './hosts';
import { ConnectRefused, HOST_KEY_REJECTIONS, openNoiseSocket } from './encrypted-carrier';

type TransportRefusal = 'request-cancelled' | 'fingerprint-mismatch' | 'unreachable';

export function signInTransportFailure(
  error: unknown,
  signal: AbortSignal,
): TeamResult<never, TransportRefusal> {
  if (signal.aborted) return { ok: false, code: 'request-cancelled' };
  if (error instanceof ConnectRefused && HOST_KEY_REJECTIONS.has(error.code))
    return { ok: false, code: 'fingerprint-mismatch' };
  return { ok: false, code: 'unreachable' };
}

export function signInRefusal<E extends string>(
  reply: unknown,
  codes: readonly E[],
): TeamResult<never, E | 'response-invalid'> {
  const { code, retryAfterSeconds } = teamRecord(reply);
  return {
    ok: false,
    code: codes.find((known) => known === code) ?? 'response-invalid',
    ...(typeof retryAfterSeconds === 'number' &&
    Number.isFinite(retryAfterSeconds) &&
    retryAfterSeconds > 0
      ? { retryAfterSeconds }
      : {}),
  };
}

export function encryptedSignIn<E extends string>(options: {
  type: 'owner-sign-in' | 'team-sign-in' | 'password-sign-in';
  carrier: HostCarrier;
  route: string;
  host: TeamHostIdentity;
  encryption: HostEncryption;
  input: unknown;
  signal: AbortSignal;
  codes: readonly E[];
}): Promise<TeamResult<unknown, E | TransportRefusal | 'response-invalid'>> {
  return new Promise((resolve) => {
    let done = false;
    let socket: ReturnType<typeof openNoiseSocket> | undefined;
    const finish = (result: TeamResult<unknown, E | TransportRefusal | 'response-invalid'>) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      options.signal.removeEventListener('abort', abort);
      resolve(result);
      socket?.close();
    };
    const abort = () => finish({ ok: false, code: 'request-cancelled' });
    const timer = setTimeout(() => finish({ ok: false, code: 'unreachable' }), 30_000);
    options.signal.addEventListener('abort', abort, { once: true });
    if (options.signal.aborted) {
      abort();
      return;
    }
    const replyType = {
      'owner-sign-in': 'owner-signed-in',
      'team-sign-in': 'team-signed-in',
      'password-sign-in': 'password-signed-in',
    }[options.type];
    try {
      socket = openNoiseSocket({
        origin: options.route,
        hostId: options.host.id,
        encryption: options.encryption,
        raw: options.carrier,
        closed: (reason) =>
          finish(signInTransportFailure(new ConnectRefused(reason), options.signal)),
        message: (frame) => {
          if (options.type === 'password-sign-in' && frame['type'] === 'refused') {
            finish(signInRefusal(frame, options.codes));
            return;
          }
          if (frame['type'] !== replyType) return;
          const result = teamRecord(frame['result']);
          finish(
            result['ok'] === true
              ? { ok: true, value: result['value'] }
              : signInRefusal(result, options.codes),
          );
        },
      });
      void socket.ready
        .then(() => {
          if (!done) socket?.send({ type: options.type, input: options.input });
        })
        .catch((error: unknown) => finish(signInTransportFailure(error, options.signal)));
    } catch (error) {
      finish(signInTransportFailure(error, options.signal));
    }
  });
}
