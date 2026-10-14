import type { HostCarrier } from '../src/host/carrier';

export function nodeCarrier(): HostCarrier {
  let cookie = '';
  return {
    async request(url, init) {
      const response = await fetch(url, {
        method: init.method,
        signal: init.signal,
        redirect: 'manual',
        headers: {
          ...(cookie ? { cookie } : {}),
          ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(init.body === undefined ? {} : { body: init.body }),
      });
      const issued = response.headers.getSetCookie();
      if (issued.length > 0) cookie = issued.map((entry) => entry.split(';')[0]).join('; ');
      return { status: response.status, text: () => response.text() };
    },
    openSocket(url, events) {
      const socket = new WebSocket(url, {
        headers: { cookie, origin: url.replace(/^ws/u, 'http').replace(/\/api\/.*$/u, '') },
      } as unknown as string[]);
      let done = false;
      const closed = (reason: string): void => {
        if (done) return;
        done = true;
        events.closed(reason);
      };
      socket.addEventListener('open', () => events.open());
      socket.addEventListener('message', (event) => events.message(String(event.data)));
      socket.addEventListener('error', () => closed('socket error'));
      socket.addEventListener('close', (event) => closed(event.reason));
      return { send: (text) => socket.send(text), close: () => socket.close() };
    },
  };
}
