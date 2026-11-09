import { describe, expect, it } from 'vitest';

import type { CallPost } from '../../../packages/core/src/voice/call-client';
import type { VoiceCallResult } from '../../../packages/core/src/voice/call-contract';
import {
  CallCaptureFailure,
  createCallSession,
} from '../../../packages/core/src/voice/call-session';
import { createPhoneCameraShare, phoneCameraState } from '../src/ui/chat/call-camera-share';

const flush = async () => {
  for (let index = 0; index < 5; index += 1) await new Promise((done) => setTimeout(done, 0));
};

function phone(options: { fail?: CallCaptureFailure } = {}) {
  const started: string[] = [];
  let stops = 0;
  const posts: Record<string, unknown>[] = [];
  const post: CallPost = async (body) => {
    posts.push(body);
    return {
      ok: true,
      call: {
        callId: 'call-0000000000000001',
        slug: 'mira',
        channelId: 'dm-mira',
        phase: body['kind'] === 'hangup' ? 'ended' : 'listening',
        muted: false,
        busy: false,
        media: 'webrtc',
        startedAt: 0,
        durationMs: 1_000,
        events: [],
        lastSeq: 0,
        offer: { type: 'offer', sdp: 'v=0' },
      },
    } as VoiceCallResult;
  };
  const share = createPhoneCameraShare(() => ({
    async start(position, testVideo) {
      started.push(testVideo === undefined ? position : `${position}:${testVideo}`);
      if (options.fail !== undefined) throw options.fail;
    },
    stop: () => void (stops += 1),
  }));
  const session = createCallSession({
    post,
    media: {
      start: async () => 'v=0',
      mute: () => undefined,
      stop: () => undefined,
      onState: () => () => undefined,
    },
    capture: share.capture,
    onChange: () => undefined,
    setInterval: () => 1,
    clearInterval: () => undefined,
  });
  return {
    share,
    session,
    started,
    stops: () => stops,
    visuals: () => posts.filter((body) => body['kind'] === 'visual').map((body) => body['source']),
    frames: () => posts.filter((body) => body['kind'] === 'frame').length,
  };
}

const frame = { source: 'camera' as const, jpeg: 'AA==', score: 0.5, skipped: 0 };

describe('phone camera share', () => {
  it('turns the camera on, flips it and turns it off with one Host visual each way', async () => {
    const world = phone();
    await world.session.client.open('mira');
    world.share.aim('front');
    expect(await world.session.share('camera')).toBe(true);
    await world.share.keyframe(frame);
    world.share.aim('back');
    expect(await world.session.share('camera', { restart: true })).toBe(true);
    expect(world.started).toEqual(['front', 'back']);
    expect(world.stops()).toBe(0);
    await world.share.keyframe(frame);
    expect(world.frames()).toBe(2);
    expect(phoneCameraState(world.session.state().visual, 'back')).toMatchObject({
      on: true,
      position: 'back',
      keyframes: 2,
    });
    await world.session.unshare('camera');
    expect(world.stops()).toBe(1);
    expect(world.visuals()).toEqual(['camera', 'off']);
    await world.share.keyframe(frame);
    expect(world.frames()).toBe(2);
  });

  it('pauses with the system and tells the Host', async () => {
    const world = phone();
    await world.session.client.open('mira');
    await world.session.share('camera');
    world.share.pause(true);
    world.share.pause(false);
    await flush();
    expect(world.visuals()).toEqual(['camera', 'off', 'camera']);
  });

  it('stops the native camera when the call is hung up with it on', async () => {
    const world = phone();
    await world.session.client.open('mira');
    await world.session.share('camera');
    await world.session.hangup();
    expect(world.stops()).toBe(1);
    expect(phoneCameraState(world.session.state().visual, 'front').on).toBe(false);
  });

  it('keeps a cancelled permission prompt silent and shows a denial', async () => {
    const cancelled = phone({ fail: new CallCaptureFailure('camera-cancelled', true) });
    await cancelled.session.client.open('mira');
    expect(await cancelled.session.share('camera')).toBe(false);
    expect(cancelled.visuals()).toEqual([]);
    expect(phoneCameraState(cancelled.session.state().visual, 'front').error).toBeUndefined();
    const denied = phone({ fail: new CallCaptureFailure('camera-denied') });
    await denied.session.client.open('mira');
    await denied.session.share('camera');
    expect(denied.visuals()).toEqual([]);
    expect(phoneCameraState(denied.session.state().visual, 'front')).toMatchObject({
      on: false,
      error: 'camera-denied',
    });
  });
});
