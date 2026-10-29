import { describe, expect, it } from 'vitest';
import { createBotCreationController, type CreationRecord } from '../src/host/bot-creation';
import { botCreationTransport } from '../src/host/bot-creation-transport';
import { parsePairingLink, redeemPairing } from '../src/host/pairing';
import { keyBytes } from '../src/host/encrypted-carrier';
import { noiseFingerprint } from '../../../packages/core/src/devices/noise/xk';
import { nodeCarrier } from './node-carrier';

const live = process.env['MOBILE_LIVE_HOST_URL'];
const gitUrl = process.env['MOBILE_LIVE_GIT_URL'];

describe.skipIf(!live || !gitUrl)('mobile Marketplace import against an isolated Host', () => {
  it('imports, loses the reply, and recovers the same Bot and DM after reopening', async () => {
    const route = new URL(live!).origin;
    const owner = nodeCarrier();
    await owner.request(live!, { method: 'GET', signal: AbortSignal.timeout(5000) });
    const ownerCall = async (path: string, input: unknown) => {
      const response = await owner.request(`${route}/api/botharness/devices/${path}`, {
        method: 'POST',
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(5000),
      });
      return JSON.parse(await response.text());
    };
    const offer = await ownerCall('offer', { origin: route });
    const parsed = parsePairingLink(offer.link);
    if (!parsed.ok) throw new Error(parsed.code);
    let approval: Promise<void> | undefined;
    let approvalError: unknown;
    const paired = await redeemPairing({
      payload: parsed.payload,
      deviceName: 'mobile import regression',
      carrier: nodeCarrier(),
      signal: AbortSignal.timeout(20_000),
      confirmFingerprint: async () => true,
      onPending(fingerprint) {
        if (approval) return;
        approval = (async () => {
          const status = await ownerCall('offer-status', { receipt: offer.receipt });
          expect(noiseFingerprint(keyBytes(status.publicKey))).toBe(fingerprint);
          const result = await ownerCall('approve-key', {
            receipt: offer.receipt,
            publicKey: status.publicKey,
            confirm: true,
          });
          expect(result.approved).toBe(true);
        })().catch((error) => {
          approvalError = error;
        });
      },
    });
    await approval;
    if (approvalError) throw approvalError;
    if (!paired.ok) throw new Error(paired.code);
    const host = paired.host;
    const carrier = nodeCarrier();
    let loseReply = true;
    const transport = botCreationTransport(() => [host], {
      ...carrier,
      async request(url, init) {
        const reply = await carrier.request(url, init);
        if (loseReply && url.endsWith('/createFromGit')) {
          loseReply = false;
          await reply.text();
          throw new Error('simulated lost response');
        }
        return reply;
      },
    });
    let disk: CreationRecord | undefined;
    const make = () =>
      createBotCreationController({
        key: () => `mobile:${crypto.randomUUID()}`,
        storage: {
          read: async () => disk,
          write: async (record) => {
            disk = structuredClone(record);
          },
        },
        port: transport,
      });
    const controller = make();
    await controller.enter({ kind: 'host', hostId: host.hostId });
    await controller.beginImport({
      gitUrl: gitUrl!,
      displayName: 'Import regression',
      origin: 'marketplace',
    });
    await controller.preview();
    expect(controller.getSnapshot().error).toBeUndefined();
    await controller.submit();
    expect(controller.getSnapshot().error).toBe('unreachable');
    expect(controller.getSnapshot().record).toMatchObject({
      kind: 'submitted',
      mutationStarted: true,
    });
    const saved = structuredClone(disk);
    const reopened = make();
    await reopened.resume();
    expect(reopened.getSnapshot()).toMatchObject({
      error: undefined,
      receipt: { status: 'created' },
    });
    const receipt = reopened.getSnapshot().receipt;
    await reopened.submit();
    expect(reopened.getSnapshot().receipt).toEqual(receipt);
    expect(disk).toEqual(saved);
  }, 120_000);
});
