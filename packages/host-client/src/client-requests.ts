import type { HostCarrier } from '@botharness/host-protocol/carrier';
import { isConnectRoute, isEncryptedRoute, isLanRoute } from '@botharness/host-protocol/route';
import type { AttachmentRef, ClientRequest } from '@botharness/host-protocol/wire';
import { LOCAL_VIDEO_PATH } from '../../computer/src/local-video-contract';
import { secretRouteRefusal } from '../../core/src/bridge/secret-route';
import { VOICE_CALL_CONNECT_REFUSAL, VOICE_CALL_PATH } from '../../core/src/voice/call-contract';
import type { HostApiAnswer, HostApiInit, HostClientOptions } from './client-contract';
import {
  CredentialRefused,
  MethodRefused,
  REFUSALS,
  Unreachable,
  refusalOf,
  type DeviceRefusal,
} from './client-errors';
import { id, record } from './client-wire';
import { ConnectRefused } from './encrypted-carrier';
import type { HostCall } from './host-answer';
import { DEVICE_PREFIX } from './pairing';

const UPLOAD_TOO_LARGE = 'The file is larger than the Host accepts.';
const uploadTimeoutMs = 120_000;
const OCTET_STREAM = 'application/octet-stream';

export function createHostRequests(
  options: HostClientOptions,
  carrier: HostCarrier,
  authorization: Record<string, string>,
  jsonAuthorization: Record<string, string>,
  timeoutMs: number,
  connection: { readonly route: string },
) {
  const withDeadline = async <T>(
    work: (signal: AbortSignal) => Promise<T>,
    ms: number = timeoutMs,
  ): Promise<T> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
      return await work(controller.signal);
    } catch (error) {
      if (error instanceof ConnectRefused) {
        if (error.code in REFUSALS) throw new CredentialRefused(error.code as DeviceRefusal);
        throw new MethodRefused(
          error.code,
          'Encrypted connection refused. Check the Host fingerprint and pair again.',
        );
      }
      if (
        error instanceof CredentialRefused ||
        error instanceof Unreachable ||
        error instanceof MethodRefused
      )
        throw error;
      throw new Unreachable(
        controller.signal.aborted
          ? 'The Host did not answer in time.'
          : 'The Host could not be reached.',
      );
    } finally {
      clearTimeout(timer);
    }
  };

  const call = <T>(
    method: string,
    args: Record<string, unknown> = {},
    via: string = connection.route,
  ): Promise<T> =>
    withDeadline(async (signal) => {
      const name = method.includes('/') ? method : `botharness/${method}`;
      const refusal =
        isEncryptedRoute(via, options.encryption) && options.encryption === undefined
          ? secretRouteRefusal(name)
          : undefined;
      if (refusal !== undefined) throw new MethodRefused(refusal.code, refusal.message);
      const request: ClientRequest = {
        type: 'client-request',
        rpcId: id(),
        method: name,
        payload: { args },
      };
      const response = await carrier.request(`${via}${DEVICE_PREFIX}/api/${name}`, {
        method: 'POST',
        body: JSON.stringify(request),
        headers: jsonAuthorization,
        signal,
      });
      if (response.status === 401 || response.status === 403) {
        const code = refusalOf(await response.text());
        if (code !== undefined) throw new CredentialRefused(code);
      }
      if (response.status === 404)
        throw new Unreachable(
          `This computer's Tobs does not support ${name} yet. Update Tobs on the computer.`,
          404,
        );
      if (response.status >= 400)
        throw new Unreachable(`The Host answered ${response.status}.`, response.status);
      let envelope: Record<string, unknown>;
      try {
        envelope = record(JSON.parse(await response.text()));
      } catch {
        throw new Unreachable('The Host did not return a JSON response.');
      }
      const result = record(envelope['result']);
      if (envelope['type'] !== 'server-response' || result['ok'] !== true) {
        const error = record(result['error']);
        throw new MethodRefused(
          typeof error['code'] === 'string' ? error['code'] : 'refused',
          typeof error['message'] === 'string' ? error['message'] : `${name} was refused.`,
          error['details'],
        );
      }
      return result['value'] as T;
    });

  const hostVia = (via?: string): HostCall => ({
    call: (method, args) => call(method, args, via),
  });
  const host = hostVia();

  const upload = (name: string, data: Blob): Promise<AttachmentRef> =>
    withDeadline(async (signal) => {
      const response = await carrier.request(
        `${connection.route}${DEVICE_PREFIX}/api/botharness/attachment/upload?${new URLSearchParams({ name })}`,
        {
          method: 'POST',
          body: data.type === OCTET_STREAM ? data : new Blob([data], { type: OCTET_STREAM }),
          headers: { ...authorization, 'content-type': OCTET_STREAM },
          signal,
        },
      );
      if (response.status === 401 || response.status === 403) {
        const code = refusalOf(await response.text());
        if (code !== undefined) throw new CredentialRefused(code);
      }
      if (response.status === 413) throw new MethodRefused('too-large', UPLOAD_TOO_LARGE);
      if (response.status >= 400) throw new Unreachable(`The Host answered ${response.status}.`);
      let attachment: unknown;
      try {
        attachment = record(JSON.parse(await response.text()))['attachment'];
      } catch {
        throw new Unreachable('The Host did not return a JSON response.');
      }
      const ref = record(attachment);
      if (typeof ref['name'] !== 'string' || typeof ref['mime'] !== 'string')
        throw new Unreachable('The Host did not accept the attachment.');
      return attachment as AttachmentRef;
    }, uploadTimeoutMs);

  const api = (path: string, init: HostApiInit = {}): Promise<HostApiAnswer> =>
    withDeadline(async (signal) => {
      if (isConnectRoute(connection.route) && path === LOCAL_VIDEO_PATH)
        return {
          status: 403,
          body: {
            ok: false,
            code: 'connect-carrier-required',
            error: 'Local Computer video requires the paired LAN route.',
          },
        };
      if (isConnectRoute(connection.route) && path === VOICE_CALL_PATH)
        return { status: 409, body: VOICE_CALL_CONNECT_REFUSAL };
      if (
        isEncryptedRoute(connection.route, options.encryption) &&
        /^\/api\/(?:browser|computer)\//u.test(path) &&
        !(isLanRoute(connection.route) && path === LOCAL_VIDEO_PATH)
      )
        throw new MethodRefused(
          'connect-viewer-unavailable',
          'Use the Host or Tailscale for Browser and Computer viewers.',
        );
      const outer = init.signal;
      if (outer?.aborted === true) throw new Unreachable('The request was cancelled.');
      const controller = new AbortController();
      const cancel = (): void => controller.abort();
      signal.addEventListener('abort', cancel);
      outer?.addEventListener('abort', cancel);
      try {
        const response = await carrier.request(`${connection.route}${DEVICE_PREFIX}${path}`, {
          method: init.body === undefined ? 'GET' : 'POST',
          ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
          headers: init.body === undefined ? authorization : jsonAuthorization,
          signal: controller.signal,
        });
        if (init.response === 'bytes' && response.status < 400) {
          if (response.bytes === undefined)
            throw new Unreachable('The connection cannot download files.');
          return { status: response.status, body: await response.bytes() };
        }
        const text = await response.text();
        if (response.status === 401 || response.status === 403) {
          const code = refusalOf(text);
          if (code !== undefined) throw new CredentialRefused(code);
        }
        if (text === '') return { status: response.status, body: null };
        try {
          return { status: response.status, body: JSON.parse(text) as unknown };
        } catch {
          return { status: response.status, body: text };
        }
      } finally {
        signal.removeEventListener('abort', cancel);
        outer?.removeEventListener('abort', cancel);
      }
    }, init.timeoutMs);

  return { withDeadline, call, hostVia, host, upload, api };
}
