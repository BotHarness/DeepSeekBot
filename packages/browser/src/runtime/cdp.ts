export interface CdpClient {
  isConnected?(): boolean;
  send(
    method: string,
    params?: Record<string, unknown>,
    sessionId?: string,
  ): Promise<Record<string, unknown>>;
  subscribe(
    method: string,
    sessionId: string | undefined,
    listener: (params: Record<string, unknown>) => void,
  ): () => void;
  close(): void;
}

interface WebSocketLike {
  send(data: string): void;
  close(): void;
  addEventListener(type: string, listener: (event: { data?: unknown }) => void): void;
}

type WebSocketCtor = new (url: string) => WebSocketLike;

export async function connectCdp(url: string, ctor?: WebSocketCtor): Promise<CdpClient> {
  const Impl = ctor ?? (globalThis as { WebSocket?: WebSocketCtor }).WebSocket;
  if (Impl === undefined) {
    throw new Error('This Node.js runtime has no WebSocket support; Node 22 or newer is required');
  }
  const socket = new Impl(url);
  const pending = new Map<
    number,
    { resolve: (value: Record<string, unknown>) => void; reject: (error: Error) => void }
  >();
  const subscriptions = new Set<{
    method: string;
    sessionId: string | undefined;
    listener: (params: Record<string, unknown>) => void;
  }>();
  let nextId = 1;
  let connected = false;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error('The DevTools websocket did not open within 10s'));
    }, 10_000);
    const fail = (): void => {
      clearTimeout(timer);
      reject(new Error('The DevTools websocket failed to open'));
    };
    socket.addEventListener('open', () => {
      clearTimeout(timer);
      connected = true;
      resolve();
    });
    socket.addEventListener('error', () => fail());
    socket.addEventListener('close', fail);
  });
  socket.addEventListener('message', (event) => {
    if (typeof event.data !== 'string') return;
    let message: {
      id?: number;
      method?: string;
      sessionId?: string;
      params?: Record<string, unknown>;
      result?: Record<string, unknown>;
      error?: { message?: string };
    };
    try {
      message = JSON.parse(event.data) as typeof message;
    } catch {
      return;
    }
    if (typeof message.id !== 'number') {
      for (const sub of subscriptions) {
        if (sub.method === message.method && sub.sessionId === message.sessionId)
          sub.listener(message.params ?? {});
      }
      return;
    }
    const entry = pending.get(message.id);
    if (entry === undefined) return;
    pending.delete(message.id);
    if (message.error !== undefined) entry.reject(new Error(message.error.message ?? 'CDP error'));
    else entry.resolve(message.result ?? {});
  });
  socket.addEventListener('close', () => {
    connected = false;
    for (const entry of pending.values()) entry.reject(new Error('The DevTools websocket closed'));
    pending.clear();
    subscriptions.clear();
  });
  return {
    isConnected: () => connected,
    send(method, params = {}, sessionId) {
      if (!connected) return Promise.reject(new Error('The DevTools websocket closed'));
      const id = nextId;
      nextId += 1;
      return new Promise<Record<string, unknown>>((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(
            new Error(
              `DevTools ${method} did not return within 30s; inspect the page before retrying the action`,
            ),
          );
        }, 30_000);
        pending.set(id, {
          resolve: (value) => {
            clearTimeout(timer);
            resolve(value);
          },
          reject: (error) => {
            clearTimeout(timer);
            reject(error);
          },
        });
        const payload: Record<string, unknown> = { id, method, params };
        if (sessionId !== undefined) payload['sessionId'] = sessionId;
        try {
          socket.send(JSON.stringify(payload));
        } catch (error) {
          pending.delete(id);
          clearTimeout(timer);
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });
    },
    subscribe(method, sessionId, listener) {
      const sub = { method, sessionId, listener };
      subscriptions.add(sub);
      return () => {
        subscriptions.delete(sub);
      };
    },
    close() {
      connected = false;
      for (const entry of pending.values())
        entry.reject(new Error('The DevTools websocket closed'));
      pending.clear();
      subscriptions.clear();
      try {
        socket.close();
      } catch {}
    },
  };
}
