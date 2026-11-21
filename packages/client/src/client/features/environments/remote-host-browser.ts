import { custodyCarrier, custodyResponse, teamCustodyResponse } from '../../remote-custody.js';
import { browserAdmissionProtocols } from '../../../../../../deploy/private-relay/admission.mjs';
import { isPrivateRoute } from '@botharness/host-protocol/route';
import type { HostCarrier } from '@botharness/host-protocol/carrier';
import { DEVICE_PREFIX } from '@botharness/host-client/pairing';

const TEAM_DEVICE_PATH = /^\/botharness-device\/team\/(device-sign-in|device-password)$/u;

export function browserCarrier(options: { teamViaHost?: boolean } = {}): HostCarrier {
  const carrier: HostCarrier = {
    custody: ({ credential }) => custodyCarrier(credential, carrier),
    async request(url, init) {
      const target = new URL(url);
      const team = TEAM_DEVICE_PATH.exec(target.pathname)?.[1];
      if (
        options.teamViaHost &&
        init.method === 'POST' &&
        typeof init.body === 'string' &&
        (team === 'device-sign-in' || team === 'device-password')
      ) {
        const response = await teamCustodyResponse(
          target.origin,
          team,
          { ...(init.headers ? { headers: init.headers } : {}), body: init.body },
          init.signal,
        );
        return {
          status: response.status,
          text: async () => new TextDecoder().decode(response.bytes),
        };
      }
      const response = await fetch(url, {
        method: init.method,
        ...(init.redirect ? { redirect: init.redirect } : {}),
        signal: init.signal,
        credentials: 'omit',
        mode: 'cors',
        headers: {
          ...(typeof init.body === 'string' ? { 'content-type': 'application/json' } : {}),
          ...init.headers,
        },
        ...(init.body === undefined ? {} : { body: init.body }),
      });
      return { status: response.status, text: () => response.text() };
    },
    openSocket(url, events, headers = {}) {
      if (new URL(url).pathname === '/botharness-device/channel') {
        const admission = headers['X-BotHarness-Admission'];
        const target = new URL(url);
        if (
          admission !== undefined &&
          (target.protocol !== 'wss:' ||
            target.username ||
            target.password ||
            target.search ||
            target.hash ||
            !isPrivateRoute(url.replace(/^ws/u, 'http')))
        )
          throw new Error('private-admission-route-invalid');
        const socket =
          admission === undefined
            ? new WebSocket(url)
            : new WebSocket(url, browserAdmissionProtocols(admission));
        socket.onopen = () => events.open();
        socket.onmessage = (event) => events.message(String(event.data));
        socket.onerror = () =>
          events.closed(
            admission === undefined
              ? 'channel-disconnected'
              : 'private-route-browser-admission-unavailable',
          );
        socket.onclose = (event) => events.closed(event.reason);
        return {
          get bufferedAmount() {
            return socket.bufferedAmount;
          },
          send: (text) => socket.send(text),
          close: () => socket.close(),
        };
      }

      const controller = new AbortController();
      let socket: WebSocket | undefined;
      let done = false;
      const closed = (reason: string): void => {
        if (done) return;
        done = true;
        events.closed(reason);
      };
      void (async () => {
        let ticket: unknown;
        try {
          const origin = new URL(url.replace(/^ws/u, 'http')).origin;
          const response = await fetch(`${origin}${DEVICE_PREFIX}/stream-ticket`, {
            method: 'POST',
            credentials: 'omit',
            mode: 'cors',
            headers,
            signal: controller.signal,
          });
          ticket = ((await response.json()) as { ticket?: unknown }).ticket;
        } catch {
          return closed('The live connection could not start.');
        }
        if (controller.signal.aborted) return closed('closed');
        if (typeof ticket !== 'string')
          return closed('The Remote Host refused the live connection.');
        socket = new WebSocket(`${url}?ticket=${encodeURIComponent(ticket)}`);
        socket.onopen = () => events.open();
        socket.onmessage = (event) => events.message(String(event.data));
        socket.onerror = () => closed('socket error');
        socket.onclose = (event) => closed(event.reason);
      })();
      return {
        send: (text) => socket?.send(text),
        close: () => {
          controller.abort();
          if (socket === undefined) closed('closed');
          else socket.close();
        },
      };
    },
  };
  return carrier;
}

export async function browserImage(
  url: string,
  headers: Record<string, string>,
): Promise<string | undefined> {
  const handle = /^Device (custody\.[A-Za-z0-9_-]{43})$/u.exec(headers['authorization'] ?? '')?.[1];
  if (handle !== undefined) {
    const response = await custodyResponse(handle, url, { method: 'GET', headers });
    if (response.status !== 200) return undefined;
    return URL.createObjectURL(
      new Blob([Uint8Array.from(response.bytes)], { type: response.contentType }),
    );
  }
  const response = await fetch(url, { credentials: 'omit', mode: 'cors', headers });
  if (!response.ok) return undefined;
  return URL.createObjectURL(await response.blob());
}
