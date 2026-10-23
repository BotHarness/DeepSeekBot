import type { DesktopInput } from '../../../../packages/computer/src/desktop-view';

export function createRemoteKeyboardInput() {
  type Pending = {
    input: DesktopInput;
    send(input: DesktopInput): Promise<boolean>;
    failed(): void;
    cost: number;
  };
  const pending: Pending[] = [];
  let stopped = false;
  let running = false;
  let size = 0;
  const stop = () => {
    stopped = true;
    pending.length = 0;
    size = 0;
  };
  async function drain() {
    if (running) return;
    running = true;
    while (!stopped && pending.length > 0) {
      const item = pending.shift()!;
      let accepted = false;
      try {
        accepted = await item.send(item.input);
      } catch {}
      if (stopped) break;
      size -= item.cost;
      if (!accepted) {
        stop();
        item.failed();
        break;
      }
    }
    running = false;
  }
  return {
    stop,
    enqueue(input: DesktopInput, send: Pending['send'], failed: Pending['failed']) {
      if (stopped) return;
      const cost = input.kind === 'type' ? input.text.length : 1;
      if (size + cost > 2000) {
        stop();
        failed();
        return;
      }
      size += cost;
      pending.push({ input, send, failed, cost });
      void drain();
    },
  };
}
