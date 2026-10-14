import type { HostCarrier, HostSocketEvents } from '../src/host/carrier';
import type { MuxClientFrame } from '../src/host/wire';
import wire from './fixtures/host-wire.json';

type Rpc = keyof typeof wire.rpc;

function recorded(method: Rpc): unknown {
  const bodies = wire.rpc[method].filter((entry) => entry.status === 200);
  return structuredClone(bodies.at(-1)!.body);
}

export class FakeHost {
  token = 'launch-token-1';
  up = true;
  private cookie = false;
  private secret = 1;
  private cookieSecret = 0;
  private sockets = new Set<{ events: HostSocketEvents; streams: Map<string, string> }>();
  readonly requests: string[] = [];

  readonly carrier: HostCarrier = {
    request: async (url, init) => {
      await Promise.resolve();
      this.requests.push(`${init.method} ${url}`);
      if (!this.up) throw new TypeError('Network request failed');
      const parsed = new URL(url);
      if (init.method === 'GET' && parsed.pathname === '/') {
        if (parsed.searchParams.get('token') === this.token || this.authenticated()) {
          this.cookie = true;
          this.cookieSecret = this.secret;
          return response(303, '');
        }
        return response(wire.login.refused.status, 'unauthorized');
      }
      if (!this.authenticated()) return response(401, 'unauthorized');
      const method = parsed.pathname.replace('/api/botharness/', '') as Rpc;
      const body = JSON.parse(init.body ?? '{}') as { rpcId: string };
      const recordedBody = recorded(method) as { rpcId: string };
      return response(200, JSON.stringify({ ...recordedBody, rpcId: body.rpcId }));
    },
    openSocket: (url, events) => {
      const entry = { events, streams: new Map<string, string>() };
      queueMicrotask(() => {
        if (!this.up) return events.closed('connection refused');
        if (!url.endsWith('/api/remote.mux') || !this.authenticated())
          return events.closed('Expected HTTP 101 response but was 401');
        this.sockets.add(entry);
        events.open();
      });
      return {
        send: (text) => {
          const frame = JSON.parse(text) as MuxClientFrame;
          if (frame.type !== 'open') return;
          entry.streams.set(frame.endpoint, frame.streamId);
          queueMicrotask(() => {
            if (frame.endpoint === 'botharness/followRoster')
              this.emit(entry, frame.streamId, wire.mux.roster[0]);
            else if (frame.endpoint === 'botharness/followActivity')
              this.emit(entry, frame.streamId, wire.mux.activity[0]);
            else
              entry.events.message(
                JSON.stringify({ ...wire.mux.unknownEndpoint!.frame, streamId: frame.streamId }),
              );
          });
        },
        close: () => {
          if (this.sockets.delete(entry)) entry.events.closed('closed by client');
        },
      };
    },
  };

  private authenticated(): boolean {
    return this.cookie && this.cookieSecret === this.secret;
  }

  private emit(entry: { events: HostSocketEvents }, streamId: string, value: unknown): void {
    entry.events.message(JSON.stringify({ type: 'item', streamId, value }));
  }

  push(endpoint: 'botharness/followRoster' | 'botharness/followActivity', value: unknown): void {
    for (const entry of this.sockets) {
      const streamId = entry.streams.get(endpoint);
      if (streamId !== undefined) this.emit(entry, streamId, value);
    }
  }

  kill(): void {
    this.up = false;
    for (const entry of this.sockets) {
      this.sockets.delete(entry);
      entry.events.closed('connection lost');
    }
  }

  restart(): void {
    this.token = `launch-token-${Number(this.token.split('-').at(-1)) + 1}`;
    this.up = true;
  }

  resetSecret(): void {
    this.secret += 1;
  }
}

function response(status: number, body: string) {
  return { status, text: async () => body };
}
