import { expect, it } from 'vitest';
import { localVideoActions } from '../src/host/local-video-actions';
import type { LocalVideoClientState } from '../../../packages/computer/src/local-video-client';

it('keeps Release and Reconnect visible for the caller grant when a stall removes input eligibility', () => {
  const state: LocalVideoClientState = {
    status: 'observing', presenting: false, busy: false, code: undefined,
    host: {
      computerId: 'local', runtimeId: 'runtime', paused: true, controller: false,
      viewerCount: 1, controlHeld: true, lastInputSequence: 0,
      binding: { computerId: 'local', runtimeId: 'runtime', viewerId: 'viewer', attemptId: 'attempt' },
      grant: { generation: 1, expiresAt: 30000 },
      media: { status: 'stalled', captureAlive: true, width: 1280, height: 720 },
    },
  };
  expect(localVideoActions(state)).toEqual({ release: true, reconnect: true });
  const { grant: _grant, ...released } = state.host!;
  expect(localVideoActions({ ...state, host: released })).toEqual({ release: false, reconnect: true });
  expect(localVideoActions({ ...state, host: undefined, status: 'opening' })).toEqual({ release: false, reconnect: false });
});
