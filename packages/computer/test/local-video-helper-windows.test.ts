import { describe, expect, it } from 'vitest';
import { createLocalVideoMedia } from '../src/media/supervisor.js';
describe.skipIf(
  process.platform !== 'win32' || process.env['BOTHARNESS_VIDEO_NATIVE_TEST'] !== '1',
)('real Windows Local Computer helper', () => {
  it('opens native video offers twice and proves each owned process tree drained', async () => {
    const events: string[] = [];
    const provider = createLocalVideoMedia({
      helperDirectory: process.env['BOTHARNESS_VIDEO_TEST_RUNTIME'],
      onEvent: (event) => events.push(event),
    });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const peer = await provider.open({
        binding: {
          computerId: 'local',
          runtimeId: 'test',
          viewerId: 'test',
          attemptId: String(attempt),
        },
        signal: AbortSignal.timeout(20_000),
        onStatus: () => {},
      });
      try {
        expect(peer.offer.sdp).toContain('m=video');
        expect(peer.offer.sdp).toContain('VP8/90000');
        expect(peer.display.width).toBeGreaterThan(0);
        expect(peer.display.height).toBeGreaterThan(0);
      } finally {
        await peer.close();
      }
    }
    expect(
      events.filter((event) => event === 'phase=media-tree-closed activeProcesses=0'),
    ).toHaveLength(2);
    expect(events.filter((event) => event.startsWith('phase=media-ready'))).toHaveLength(2);
    expect(events.some((event) => event.startsWith('phase=media-failed'))).toBe(false);
    expect(events.filter((event) => event.startsWith('phase=media-exit exitCode=0 '))).toHaveLength(
      2,
    );
  }, 60_000);
});
