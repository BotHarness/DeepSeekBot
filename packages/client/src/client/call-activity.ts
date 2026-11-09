import type { DesktopCall } from './desktop-call.js';
import { shellLiveActivity, type ShellLiveActivityApi } from './desktop-shell.js';

export function holdCallActivity(
  call: DesktopCall,
  live: ShellLiveActivityApi | undefined = shellLiveActivity(),
): () => void {
  if (live === undefined) return () => undefined;
  let wanted = false;
  let lease: string | undefined;
  let pending: Promise<void> | undefined;
  const release = (held: string) => {
    void live.release(held).catch(() => undefined);
  };
  const settle = () => {
    if (pending !== undefined) return;
    if (wanted && lease === undefined) {
      pending = live.acquire('call').then(
        (acquired) => {
          pending = undefined;
          lease = acquired;
          settle();
        },
        () => {
          pending = undefined;
        },
      );
    } else if (!wanted && lease !== undefined) {
      const held = lease;
      lease = undefined;
      release(held);
    }
  };
  const sync = () => {
    const status = call.snapshot().state.status;
    wanted = status === 'opening' || status === 'live';
    settle();
  };
  const unsubscribe = call.subscribe(sync);
  sync();
  return () => {
    unsubscribe();
    wanted = false;
    settle();
  };
}
