import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CallClientMedia } from '../../core/src/voice/call-client.js';
import { createDesktopCall, desktopCallNotice } from '../src/client/desktop-call.js';
import type { MeetingSound } from '../src/client/meeting-sound.js';

const cleanup: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0)) await close();
});

function sound(onRelease: () => void): MeetingSound {
  return {
    stream: {} as MediaStream,
    mute: () => undefined,
    onEnded: () => undefined,
    release: onRelease,
  };
}

const unusedMedia: CallClientMedia = {
  start: async () => {
    throw new Error('the Host refused, so media must not start');
  },
  mute: () => undefined,
  stop: () => undefined,
  onState: () => () => undefined,
};

describe('bringing a Bot to a meeting', () => {
  it('opens the meeting share on the click, before asking the Host, and releases it when the Host refuses', async () => {
    const order: string[] = [];
    let released = 0;
    const call = createDesktopCall({
      post: async (body) => {
        order.push(String(body['kind']));
        return {
          ok: true,
          readiness: {
            slug: 'mira',
            ready: false,
            missing: ['asr'],
            asrProviderId: null,
            ttsProviderId: null,
            media: 'ready',
            activeCallId: null,
            callElsewhere: false,
          },
        };
      },
      media: () => unusedMedia,
      meetingSound: async () => {
        order.push('share');
        return sound(() => {
          released += 1;
        });
      },
    });
    cleanup.push(() => call.hangup());
    await call.start('mira', undefined, { meeting: true });
    expect(order).toEqual(['share', 'readiness']);
    expect(desktopCallNotice(call.snapshot())).toEqual(['call.missing.asr']);
    await vi.waitFor(() => expect(released).toBe(1));
  });

  it('cancels a meeting start and releases the share when the Owner hangs up while the Host is checked', async () => {
    let answer: () => void = () => undefined;
    let released = 0;
    let mediaMade = 0;
    const call = createDesktopCall({
      post: () =>
        new Promise((resolve) => {
          answer = () =>
            resolve({
              ok: true,
              readiness: {
                slug: 'mira',
                ready: true,
                missing: [],
                asrProviderId: 'asr',
                ttsProviderId: null,
                media: 'ready',
                activeCallId: null,
                callElsewhere: false,
              },
            });
        }),
      media: () => {
        mediaMade += 1;
        return unusedMedia;
      },
      meetingSound: async () =>
        sound(() => {
          released += 1;
        }),
    });
    const starting = call.start('mira', undefined, { meeting: true });
    await vi.waitFor(() => expect(call.snapshot().checking).toBe(true));
    await call.hangup();
    expect(call.snapshot().checking).toBe(false);
    answer();
    await starting;
    expect(mediaMade).toBe(0);
    await vi.waitFor(() => expect(released).toBe(1));
  });
});
