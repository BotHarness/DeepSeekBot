import type { SavedHosts } from './hosts';

export function createHostTransitions<Trigger>(port: {
  read(): SavedHosts;
  save(value: SavedHosts): Promise<void>;
  adopt(value: SavedHosts, trigger: Trigger): void;
}) {
  let pending = Promise.resolve();
  return (
    update: (current: SavedHosts) => SavedHosts | undefined,
    trigger: Trigger,
    valid = () => true,
  ): Promise<boolean> => {
    const next = pending.then(async () => {
      if (!valid()) return false;
      const previous = port.read();
      const value = update(previous);
      if (!value) return false;
      await port.save(value);
      if (!valid()) {
        await port.save(previous);
        return false;
      }
      port.adopt(value, trigger);
      return true;
    });
    pending = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  };
}
