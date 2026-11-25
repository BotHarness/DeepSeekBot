export function createPendingPairs() {
  const waiting = new Map<string, () => void>();
  return (receipt: string, unwatch: () => void, replace: () => void) => {
    const older = waiting.get(receipt);
    waiting.set(receipt, replace);
    older?.();
    return () => {
      unwatch();
      if (waiting.get(receipt) === replace) waiting.delete(receipt);
    };
  };
}
