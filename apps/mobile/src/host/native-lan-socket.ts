import { requireOptionalNativeModule } from 'expo';
import type { HostSocket, HostSocketEvents } from './carrier';
import { isLanRoute } from './route';

interface LanModule {
  open(id: string, address: string, port: number): void;
  send(id: string, text: string): void;
  close(id: string): void;
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
  const subscription = native.addListener('channel', (event) => {
    if (event.id !== id || done) return;
    if (event.type === 'open') events.open();
    else if (event.type === 'message') events.message(event.text);
    else if (event.type === 'closed') finish(event.text);
  });
  try {
    native.open(id, parsed.hostname, Number(parsed.port));
  } catch (error) {
    subscription.remove();
    throw error;
  }
  return { send: (text) => native.send(id, text), close: () => finish('channel-disconnected') };
}
