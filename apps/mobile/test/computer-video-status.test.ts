import { describe, expect, it } from 'vitest';
import type { LocalVideoClientState } from '../../../packages/computer/src/local-video-client';
import type { ConnectionState } from '../src/host/client';
import { computerVideoStatus } from '../src/ui/chat/computer-video-status';

const connected = {
  status: 'connected',
  route: 'http://localhost:39100',
} satisfies ConnectionState;
const watching: LocalVideoClientState = {
  status: 'observing',
  presenting: true,
  busy: false,
  code: undefined,
  host: {
    computerId: 'local',
    runtimeId: 'runtime',
    paused: false,
    controller: false,
    viewerCount: 1,
    controlHeld: false,
    lastInputSequence: 0,
    media: { status: 'live', captureAlive: true, width: 1280, height: 720 },
  },
};

describe('Computer header facts', () => {
  it('requires both the live Host and native presentation to show a green connection', () => {
    expect(computerVideoStatus(watching, connected)).toEqual({
      connection: 'live',
      control: 'bot',
    });
    expect(computerVideoStatus({ ...watching, presenting: false }, connected).connection).toBe(
      'waiting',
    );
    for (const media of [
      { ...watching.host!.media, status: 'stalled' as const },
      { ...watching.host!.media, captureAlive: false },
    ])
      expect(
        computerVideoStatus({ ...watching, host: { ...watching.host!, media } }, connected)
          .connection,
      ).toBe('waiting');
    expect(computerVideoStatus({ ...watching, status: 'unavailable' }, connected).connection).toBe(
      'disconnected',
    );
  });

  it('never presents cached ownership or a green dot after disconnection', () => {
    expect(
      computerVideoStatus(watching, { status: 'reconnecting', route: connected.route, attempt: 1 }),
    ).toEqual({ connection: 'disconnected', control: 'unknown' });
    expect(
      computerVideoStatus(
        { ...watching, host: undefined, presenting: false, status: 'opening' },
        connected,
      ),
    ).toEqual({ connection: 'waiting', control: 'unknown' });
  });

  it('clears retained ownership after video failure and during handback', () => {
    const host = { ...watching.host!, paused: true, controlHeld: true, controller: false };
    for (const status of ['idle', 'opening', 'unavailable'] as const) {
      expect(computerVideoStatus({ ...watching, status, host }, connected).control).toBe('unknown');
    }
    expect(computerVideoStatus({ ...watching, busy: true, host }, connected).control).toBe(
      'unknown',
    );
  });

  it('distinguishes our grant, another controller, paused Bots and Bots allowed to operate', () => {
    const host = {
      ...watching.host!,
      paused: true,
      controlHeld: true,
      controller: true,
      grant: { generation: 1, expiresAt: 30000 },
    };
    expect(
      computerVideoStatus({ ...watching, status: 'controlling', host }, connected).control,
    ).toBe('human');
    const { grant: _grant, ...released } = host;
    expect(
      computerVideoStatus({ ...watching, host: { ...released, controller: false } }, connected)
        .control,
    ).toBe('other-human');
    expect(
      computerVideoStatus(
        { ...watching, host: { ...released, controller: false, controlHeld: false } },
        connected,
      ).control,
    ).toBe('paused');
    expect(computerVideoStatus(watching, connected).control).toBe('bot');
  });
});
