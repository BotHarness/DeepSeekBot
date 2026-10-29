import { expect, it, vi } from 'vitest';

import { recordConnectTelemetry } from '../src/devices/mount.js';

it('maps Connect sign-in phases to the tracking plan and ignores the rest', () => {
  const capture = vi.fn();
  for (const phase of [
    'sign-in-started',
    'signed-in',
    'sign-in-failed',
    'sign-in-expired',
    'tunnel-ready',
  ])
    recordConnectTelemetry({ capture }, phase);
  recordConnectTelemetry(undefined, 'signed-in');
  expect(capture.mock.calls).toEqual([
    ['connect:sign_in_start'],
    ['connect:sign_in_complete', { outcome: 'success' }],
    ['connect:sign_in_complete', { outcome: 'denied' }],
    ['connect:sign_in_complete', { outcome: 'expired' }],
  ]);
});
