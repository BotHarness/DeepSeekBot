import { describe, expect, it, vi } from 'vitest';

const removed = vi.fn();
vi.mock('react-native', () => ({
  BackHandler: { addEventListener: vi.fn(() => ({ remove: removed })) },
}));

import { backHeld, holdBack, watchBackHeld } from '../src/ui/shell/back-owner';

describe('Back owners', () => {
  it('tells the predictive back hook while something in the app wants Back', () => {
    const watcher = vi.fn();
    const stop = watchBackHeld(watcher);
    expect(backHeld()).toBe(false);
    const drawer = holdBack(() => true);
    const search = holdBack(() => true);
    expect(backHeld()).toBe(true);
    drawer.remove();
    drawer.remove();
    expect(backHeld()).toBe(true);
    search.remove();
    expect(backHeld()).toBe(false);
    expect(removed).toHaveBeenCalledTimes(2);
    expect(watcher).toHaveBeenCalledTimes(4);
    stop();
  });
});
