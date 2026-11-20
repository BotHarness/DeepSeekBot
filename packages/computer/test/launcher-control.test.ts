import { expect, it, vi } from 'vitest';
import { launcherControl } from '../src/media/launcher-control.js';

function setup() {
  const owned = vi.fn(),
    closed = vi.fn(),
    rejected = vi.fn();
  const receive = launcherControl({ launchId: 'current', owned, closed, rejected });
  const frame = (value: object) =>
    JSON.stringify({ launchId: 'current', version: 1, ...value }) + '\n';
  return { owned, closed, rejected, receive, frame };
}

it('accepts split frames and identical repeated proof only once', () => {
  const h = setup();
  const owned = h.frame({ event: 'tree-owned', rootPid: 42 });
  h.receive(owned.slice(0, 10));
  h.receive(owned.slice(10));
  h.receive(owned);
  const closed = h.frame({ event: 'tree-closed', activeProcesses: 0 });
  h.receive(closed);
  h.receive(closed);
  expect(h.owned).toHaveBeenCalledExactlyOnceWith(42);
  expect(h.closed).toHaveBeenCalledOnce();
  expect(h.rejected).not.toHaveBeenCalled();
});

it.each([
  'not-json\n',
  'x'.repeat(4097),
  JSON.stringify({ event: 'tree-owned', rootPid: 42, version: 1, launchId: 'old' }) + '\n',
  JSON.stringify({ event: 'tree-closed', activeProcesses: 0, version: 1, launchId: 'current' }) +
    '\n',
])('refuses malformed, oversized, stale or unowned control frames', (input) => {
  const h = setup();
  h.receive(input);
  h.receive(input);
  expect(h.rejected).toHaveBeenCalledOnce();
  expect(h.closed).not.toHaveBeenCalled();
});

it.each(['changed-root', 'owned-after-close'])(
  'rejects %s instead of treating it as a harmless duplicate',
  (mode) => {
    const h = setup();
    h.receive(h.frame({ event: 'tree-owned', rootPid: 42 }));
    if (mode === 'owned-after-close')
      h.receive(h.frame({ event: 'tree-closed', activeProcesses: 0 }));
    h.receive(h.frame({ event: 'tree-owned', rootPid: mode === 'changed-root' ? 43 : 42 }));
    expect(h.rejected).toHaveBeenCalledOnce();
  },
);
