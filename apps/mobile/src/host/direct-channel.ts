import type { HostSocket, HostSocketEvents } from './carrier';

export const DIRECT_STUN = ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'];

export type DirectEvent = { id: string; kind: 'open' | 'message' | 'closed'; text?: string };

export interface DirectNative {
  directOffer(id: string, iceServers: string[]): Promise<string>;
  directAnswer(id: string, answer: string): Promise<void>;
  directSend(id: string, text: string): boolean;
  directClose(id: string): void;
  addListener(event: 'onDirect', listener: (event: DirectEvent) => void): { remove(): void };
}

export async function openDirectChannel(options: {
  native: DirectNative;
  id: string;
  signal(offer: string): Promise<string>;
  iceServers?: readonly string[];
  openTimeoutMs?: number;
}): Promise<((events: HostSocketEvents) => HostSocket) | undefined> {
  const { native, id } = options;
  let opened = false;
  let closed = false;
  let target: HostSocketEvents | undefined;
  const backlog: string[] = [];
  let wake: (() => void) | undefined;
  const subscription = native.addListener('onDirect', (event) => {
    if (event.id !== id) return;
    if (event.kind === 'open') {
      opened = true;
      wake?.();
    } else if (event.kind === 'message' && typeof event.text === 'string') {
      if (target) target.message(event.text);
      else if (backlog.length < 64) backlog.push(event.text);
    } else if (event.kind === 'closed') {
      closed = true;
      subscription.remove();
      wake?.();
      target?.closed('direct-closed');
    }
  });
  const fail = (error: unknown): never => {
    subscription.remove();
    native.directClose(id);
    throw error;
  };
  try {
    const offer = await native.directOffer(id, [...(options.iceServers ?? DIRECT_STUN)]);
    await native.directAnswer(id, await options.signal(offer));
    if (!opened && !closed)
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, options.openTimeoutMs ?? 8_000);
        wake = () => {
          clearTimeout(timer);
          resolve();
        };
      });
    if (!opened || closed) fail(new Error('direct-open-timeout'));
  } catch (error) {
    fail(error);
  }
  let used = false;
  return (events) => {
    if (used) throw new Error('direct-channel-used');
    used = true;
    target = events;
    queueMicrotask(() => {
      if (closed) {
        events.closed('direct-closed');
        return;
      }
      events.open();
      for (const text of backlog.splice(0)) events.message(text);
    });
    return {
      send: (text) => {
        if (closed || !native.directSend(id, text)) throw new Error('direct-closed');
      },
      close: () => {
        if (closed) return;
        closed = true;
        subscription.remove();
        native.directClose(id);
      },
    };
  };
}
