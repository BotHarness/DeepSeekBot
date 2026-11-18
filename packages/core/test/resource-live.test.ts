import { afterEach, describe, expect, it } from 'vitest';

import {
  createChannelLiveHub,
  CHANNEL_STREAM_PATH,
  type ChannelLiveHub,
} from '../src/channels/live.js';
import { RESOURCE_CHANGED_EVENT, type LiveResource } from '../src/channels/resource-events.js';
import { createChannelStore } from '../src/channels/store.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createDevicePairing } from '../src/devices/pairing.js';
import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { createTempRoot, trackTestOwner } from './helpers.js';

const hubs: ChannelLiveHub[] = [];

afterEach(() => {
  for (const hub of hubs.splice(0)) hub.close();
});

function hub(): ChannelLiveHub {
  const value = createChannelLiveHub(
    createChannelStore({ rootDir: createTempRoot('botharness-resource-live-') }),
  );
  hubs.push(value);
  return value;
}

async function readUntil(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  marker: string,
): Promise<string> {
  let text = '';
  while (!text.includes(marker)) {
    const chunk = await reader.read();
    if (chunk.done) break;
    text += new TextDecoder().decode(chunk.value);
  }
  return text;
}

describe('resource changes on the live stream', () => {
  it('tells owner roster streams which resource changed and nobody else', async () => {
    const live = hub();
    const request = () => new Request(`http://localhost${CHANNEL_STREAM_PATH}?scope=roster`);
    const owner = live.open(OWNER_HUMAN_CONTEXT, request()).body!.getReader();
    const guest = live
      .open({ ...OWNER_HUMAN_CONTEXT, humanId: 'h_guest' }, request())
      .body!.getReader();
    try {
      await readUntil(owner, 'retry:');
      await readUntil(guest, 'retry:');
      live.publishResourceChanged('devices');
      live.publishRosterCommitted();
      const ownerText = await readUntil(owner, 'roster/changed');
      expect(ownerText).toContain(
        `event: ${RESOURCE_CHANGED_EVENT}\ndata: {"resource":"devices","revision":1}`,
      );
      const guestText = await readUntil(guest, 'roster/changed');
      expect(guestText).not.toContain(RESOURCE_CHANGED_EVENT);
    } finally {
      await owner.cancel();
      await guest.cancel();
    }
  });

  it('tells every roster stream when private input requests change', async () => {
    const live = hub();
    const request = () => new Request(`http://localhost${CHANNEL_STREAM_PATH}?scope=roster`);
    const guest = live
      .open({ ...OWNER_HUMAN_CONTEXT, humanId: 'h_guest' }, request())
      .body!.getReader();
    try {
      await readUntil(guest, 'retry:');
      live.publishResourceChanged('private-inputs');
      expect(await readUntil(guest, 'private-inputs')).toContain(
        `event: ${RESOURCE_CHANGED_EVENT}\ndata: {"resource":"private-inputs","revision":1}`,
      );
    } finally {
      await guest.cancel();
    }
  });

  it('coalesces queued changes of one resource into its latest revision for phones', async () => {
    const live = hub();
    const controller = new AbortController();
    const frames = live
      .followRoster(OWNER_HUMAN_CONTEXT, controller.signal)
      [Symbol.asyncIterator]();
    expect((await frames.next()).value).toMatchObject({ type: 'baseline' });
    live.publishResourceChanged('devices');
    live.publishResourceChanged('relationships');
    live.publishResourceChanged('devices');
    expect((await frames.next()).value).toEqual({
      type: 'resource',
      change: { resource: 'relationships', revision: 2 },
    });
    expect((await frames.next()).value).toEqual({
      type: 'resource',
      change: { resource: 'devices', revision: 3 },
    });
    controller.abort();
    await frames.return?.();
  });

  it('announces every device pairing step the Devices page shows', () => {
    const owner = trackTestOwner(
      mountOperationalDatabase({
        dshHome: createTempRoot('botharness-resource-pairing-'),
        schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
      }),
    );
    const changes: LiveResource[] = [];
    owner.subscribe(({ topics }) => {
      if (topics.includes('paired-devices')) changes.push('devices');
    });
    const pairing = createDevicePairing({
      database: attachOperationalModule(owner, 'device-pairing'),
      hostName: 'studio',
      onChange: () => changes.push('devices'),
    });
    const publicKey = 'ab'.repeat(32);
    const offer = pairing.createOffer();
    const step = (run: () => unknown): number => {
      const before = changes.length;
      run();
      return changes.length - before;
    };
    expect(step(() => pairing.requestKey({ offer: offer.offer, publicKey, name: 'Phone' }))).toBe(
      1,
    );
    expect(step(() => pairing.requestKey({ offer: offer.offer, publicKey, name: 'Phone' }))).toBe(
      0,
    );
    expect(step(() => pairing.approveKey(offer.receipt, publicKey))).toBe(1);
    let deviceId = '';
    expect(
      step(() => {
        const paired = pairing.redeem({ offer: offer.offer, publicKey });
        if (paired.ok) deviceId = paired.device.id;
      }),
    ).toBeGreaterThan(0);
    expect(deviceId).not.toBe('');
    expect(step(() => pairing.revoke(deviceId))).toBe(1);
    pairing.createOffer();
    expect(step(() => pairing.clearOffers())).toBe(1);
    expect(step(() => pairing.clearOffers())).toBe(0);
  });
});
