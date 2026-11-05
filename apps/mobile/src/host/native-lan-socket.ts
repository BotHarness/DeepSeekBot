import { requireOptionalNativeModule } from 'expo';
import type { HostSocket, HostSocketEvents, LocalNetworkStatus } from './carrier';
import { isLanRoute } from './route';

interface LanModule {
  open(id: string, address: string, port: number): void;
  send(id: string, text: string): void;
  close(id: string): void;
  localNetwork?(address: string, port: number): Promise<string>;
  addListener(
    name: 'channel',
    listener: (event: { id: string; type: string; text: string }) => void,
  ): { remove(): void };
}
let sequence = 0;
export function openLanSocket(url: string, events: HostSocketEvents): HostSocket {
  const parsed = new URL(url.replace(/^ws:/u, 'http:'));
  if (
    !isLanRoute(parsed.origin) ||
    parsed.pathname !== '/botharness-device/channel' ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  )
    throw new Error('lan-route-invalid');
  const native = requireOptionalNativeModule<LanModule>('LanChannel');
  if (!native) throw new Error('lan-build-required');
  const id = `lan-${++sequence}`;
  let done = false;
  const finish = (reason: string) => {
    if (done) return;
    done = true;
    subscription.remove();
    native.close(id);
    events.closed(reason);
  };
  let early: { type: string; text: string }[] | undefined = [];
  const handle = (event: { type: string; text: string }) => {
    if (done) return;
    if (event.type === 'open') events.open();
    else if (event.type === 'message') events.message(event.text);
    else if (event.type === 'closed') finish(event.text);
  };
  const subscription = native.addListener('channel', (event) => {
    if (event.id !== id) return;
    if (early) early.push(event);
    else handle(event);
  });
  try {
    native.open(id, parsed.hostname, Number(parsed.port));
  } catch (error) {
    subscription.remove();
    throw error;
  }
  queueMicrotask(() => {
    const queued = early ?? [];
    early = undefined;
    queued.forEach(handle);
  });
  return { send: (text) => native.send(id, text), close: () => finish('channel-disconnected') };
}

export async function localNetworkStatus(origin: string): Promise<LocalNetworkStatus> {
  if (!isLanRoute(origin)) return 'unknown';
  const native = requireOptionalNativeModule<LanModule>('LanChannel');
  if (!native?.localNetwork) return 'unknown';
  const url = new URL(origin);
  try {
    const status = await native.localNetwork(url.hostname, Number(url.port || 80));
    return status === 'denied' ||
      status === 'reachable' ||
      status === 'unreachable' ||
      status === 'timeout'
      ? status
      : 'unknown';
  } catch {
    return 'unknown';
  }
}
