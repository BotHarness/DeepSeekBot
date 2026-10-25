import { expect, it } from 'vitest';
import type { LocalVideoClientState } from '../../../packages/computer/src/local-video-client';
import { computerHeaderState } from '../src/ui/chat/computer-header-state';

const host: NonNullable<LocalVideoClientState['host']> = {
  computerId: 'local',
  runtimeId: 'runtime',
  paused: false,
  controller: false,
  viewerCount: 1,
  controlHeld: false,
  lastInputSequence: 0,
  media: { status: 'live', captureAlive: true, width: 1280, height: 720 },
};
const state: LocalVideoClientState = {
  status: 'observing',
  presenting: true,
  busy: false,
  code: undefined,
  host,
};

it('shows green only while both source capture and phone presentation are live', () => {
  expect(computerHeaderState(true, state)).toEqual({ signal: 'live', controller: 'bot' });
  expect(computerHeaderState(true, { ...state, presenting: false }).signal).toBe('waiting');
  expect(
    computerHeaderState(true, {
      ...state,
      host: { ...host, media: { ...host.media, captureAlive: false } },
    }).signal,
  ).toBe('waiting');
  expect(
    computerHeaderState(true, {
      ...state,
      host: { ...host, media: { ...host.media, status: 'stalled' } },
    }).signal,
  ).toBe('waiting');
});

it('does not retain live or Human-control icons after disconnect or attempt loss', () => {
  const controlling = {
    ...state,
    status: 'controlling',
    host: { ...host, controlHeld: true, paused: true },
  } satisfies LocalVideoClientState;
  expect(computerHeaderState(true, controlling).controller).toBe('human');
  expect(computerHeaderState(false, controlling)).toEqual({
    signal: 'offline',
    controller: 'unknown',
  });
  expect(computerHeaderState(true, { ...controlling, status: 'opening' })).toEqual({
    signal: 'waiting',
    controller: 'unknown',
  });
});

it('distinguishes a paused Computer without a Human grant from Bot control', () => {
  expect(computerHeaderState(true, { ...state, host: { ...host, paused: true } }).controller).toBe(
    'paused',
  );
  expect(
    computerHeaderState(true, { ...state, host: { ...host, paused: true, controlHeld: true } })
      .controller,
  ).toBe('human');
  expect(computerHeaderState(true, { ...state, status: 'unavailable' })).toEqual({
    signal: 'offline',
    controller: 'unknown',
  });
});
