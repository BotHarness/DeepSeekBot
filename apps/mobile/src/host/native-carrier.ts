import type { HostCarrier } from './carrier';

type NativeWebSocket = new (
  url: string,
  protocols: undefined,
  options: { headers: Record<string, string> },
) => WebSocket;

export function nativeCarrier(route: string): HostCarrier {
  return {
    async request(url, init) {
      const response = await fetch(url, {
        method: init.method,
        signal: init.signal,
        credentials: 'include',
        headers: init.body === undefined ? {} : { 'content-type': 'application/json' },
        ...(init.body === undefined ? {} : { body: init.body }),
      });
      return { status: response.status, text: () => response.text() };
    },
    openSocket(url, events) {
      const socket = new (WebSocket as unknown as NativeWebSocket)(url, undefined, {
        headers: { origin: route },
      });
      let done = false;
      const closed = (reason: string): void => {
        if (done) return;
        done = true;
        events.closed(reason);
      };
      socket.onopen = () => events.open();
      socket.onmessage = (event) => events.message(String(event.data));
      socket.onerror = (event) => closed((event as { message?: string }).message ?? 'socket error');
      socket.onclose = (event) => closed(event.reason);
      return { send: (text) => socket.send(text), close: () => socket.close() };
    },
  };
}
