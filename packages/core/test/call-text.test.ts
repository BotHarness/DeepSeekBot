import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { randomUUID } from 'node:crypto';

import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';

import { createBridgeMethods } from '../src/bridge/methods.js';
import { createCore } from '../src/plugin.js';
import type { BotAgentAdapter, OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';
import type { VoiceCallView } from '../src/voice/call-contract.js';
import { createCallTextHarvest } from '../src/voice/call-text.js';
import { createVoiceCalls } from '../src/voice/calls.js';
import { createTempRoot } from './helpers.js';

const cleanup: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});

async function frame(shade: number): Promise<string> {
  return (
    await sharp({
      create: { width: 160, height: 90, channels: 3, background: { r: shade, g: 40, b: 90 } },
    })
      .jpeg()
      .toBuffer()
  ).toString('base64');
}

function setup() {
  const runs: OrchestratorAgentRun[] = [];
  const agents: BotAgentAdapter = {
    async runOrchestrator(run) {
      runs.push(run);
    },
    async runAssignment() {},
    requestAssignment() {
      throw new Error('No Assignment expected');
    },
    async close() {},
  };
  const core = createCore({ dshHome: createTempRoot('botharness-call-text-'), agents });
  cleanup.push(async () => {
    await core.runtime.close();
    core.operationalDatabase.close();
  });
  core.registry.create({ slug: 'mira', displayName: 'Mira' });
  core.registry.create({ slug: 'ada', displayName: 'Ada' });
  const dm = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'mira', 'Mira')!;
  const other = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
  let clock = 3_000_000;
  const calls = createVoiceCalls({
    bot: (slug) =>
      slug === 'mira'
        ? {
            slug,
            asr: { providerId: 'asr-000000000001' },
            voice: { providerId: 'tts-000000000001' },
          }
        : undefined,
    providers: {
      has: () => true,
      transcribe: async () => ({ text: '', latencyMs: 1 }),
      synthesize: async () => ({
        audio: new Uint8Array([0x49, 0x44, 0x33, 0]),
        mime: 'audio/mpeg',
      }),
    },
    media: () => undefined,
    send: async () => undefined,
    busy: () => false,
    now: () => clock,
  });
  cleanup.push(() => calls.dispose());
  const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, {
    registry: core.registry,
    states: core.states,
    channels: core.channels,
    ownership: core.ownership,
    roster: core.roster,
    runtime: core.runtime,
    callText: createCallTextHarvest({ calls: () => calls, attachments: core.attachments }),
  });
  const ok = async (command: Record<string, unknown>) => {
    const result = await calls.handle({ deviceId: 'phone-1' }, command);
    if (!result.ok) throw new Error(`${result.code}: ${result.error}`);
    return result.call as VoiceCallView;
  };
  return {
    core,
    dm,
    other,
    calls,
    methods,
    runs,
    ok,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

describe('text typed into a Bot DM during a call', () => {
  it('rides with the keyframes that waited, keeps zoom, tells the Bot, and leaves other DMs alone', async () => {
    const h = setup();
    const outside = await h.methods.channelSend({ channelId: h.dm.id, body: 'before the call' });
    expect(outside).toMatchObject({ ok: true });
    expect(
      (outside as unknown as { value: { message: Record<string, unknown> } }).value.message,
    ).not.toHaveProperty('voiceCall');
    const call = await h.ok({ kind: 'open', slug: 'mira', media: 'synthetic' });
    expect(call.channelId).toBe(h.dm.id);
    await h.ok({ kind: 'visual', callId: call.callId, source: 'screen' });
    for (let index = 0; index < 5; index += 1) {
      h.advance(1_000);
      await h.ok({
        kind: 'frame',
        callId: call.callId,
        source: 'screen',
        jpeg: await frame(index * 50),
      });
    }
    h.advance(1_000);
    const elsewhere = await h.methods.channelSend({ channelId: h.other.id, body: 'hi Ada' });
    expect(
      (elsewhere as unknown as { value: { message: Record<string, unknown> } }).value.message,
    ).not.toHaveProperty('voiceCall');

    const messageId = `human-${randomUUID()}`;
    const sent = await h.methods.channelSend({
      channelId: h.dm.id,
      messageId,
      body: 'what is on my screen?',
    });
    expect(sent).toMatchObject({ ok: true });
    const message = h.core.channels.message(h.dm.id, messageId)!;
    expect(message.voiceCall).toEqual({
      callId: call.callId,
      atMs: 6_000,
      visual: { source: 'screen', frames: 5, layout: '3+2', fromMs: 1_000, toMs: 5_000 },
    });
    expect(message.attachments).toHaveLength(1);
    expect(message.attachments![0]!.mime).toBe('image/jpeg');
    expect(h.calls.zoom({ slug: 'mira', messageId, cell: 3 })).toMatchObject({
      released: false,
      cells: 5,
    });

    expect(
      await h.methods.channelSend({ channelId: h.dm.id, messageId, body: 'what is on my screen?' }),
    ).toMatchObject({ ok: true, value: { message: { id: messageId } } });
    expect(h.core.channels.message(h.dm.id, messageId)!.attachments).toHaveLength(1);

    const again = `human-${randomUUID()}`;
    await h.methods.channelSend({ channelId: h.dm.id, messageId: again, body: 'and now?' });
    expect(h.core.channels.message(h.dm.id, again)!.voiceCall).toEqual({
      callId: call.callId,
      atMs: 6_000,
      visual: { source: 'screen', sameAs: messageId },
    });

    await h.core.runtime.whenIdle();
    const prompt = h.runs.map((run) => run.message).find((text) => text.includes(messageId))!;
    expect(prompt).toContain(`[Voice call ${call.callId}: typed at 0:06, picture 0:01–0:05]`);
    expect(prompt).toContain('a 3+2 grid of 5 keyframes');
    expect(prompt).toContain(`attachment_id ${message.attachments![0]!.fileId}`);

    await h.ok({ kind: 'hangup', callId: call.callId });
    const after = `human-${randomUUID()}`;
    await h.methods.channelSend({ channelId: h.dm.id, messageId: after, body: 'thanks' });
    expect(h.core.channels.message(h.dm.id, after)!.voiceCall).toBeUndefined();
  });

  it('refuses a voiceCall that mixes a typed arrival time with a speech range', async () => {
    const h = setup();
    const call = await h.ok({ kind: 'open', slug: 'mira', media: 'synthetic' });
    expect(
      await h.methods.channelSend({
        channelId: h.dm.id,
        body: 'mixed',
        voiceCall: { callId: call.callId, atMs: 10, speechFromMs: 0, speechToMs: 5 },
      }),
    ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
  });
});

describe('call text harvest', () => {
  it('keeps the call id and arrival time and returns the keyframes when the grid upload fails', async () => {
    const settled: boolean[] = [];
    const harvest = createCallTextHarvest({
      calls: () => ({
        text: async () => ({
          callId: 'call-0123456789abcdef',
          atMs: 4_200,
          visual: { source: 'camera', sameAs: 'human-1' },
          settle: (sent: boolean) => settled.push(sent),
        }),
      }),
      attachments: {
        upload: async () => {
          throw new Error('The attachment store is full.');
        },
      },
    });
    const failing = createCallTextHarvest({
      calls: () => ({
        text: async () => ({
          callId: 'call-0123456789abcdef',
          atMs: 4_200,
          visual: {
            source: 'camera',
            frames: 1,
            fromMs: 1_000,
            toMs: 1_000,
            saved: true,
            image: { jpeg: new Uint8Array([1]), width: 1, height: 1, layout: '1' },
          } as never,
          settle: (sent: boolean) => settled.push(sent),
        }),
      }),
      attachments: {
        upload: async () => {
          throw new Error('The attachment store is full.');
        },
      },
    });
    const pointer = await harvest({ channelId: 'dm-mira', messageId: 'human-2', picture: true });
    expect(pointer!.voiceCall).toEqual({
      callId: 'call-0123456789abcdef',
      atMs: 4_200,
      visual: { source: 'camera', sameAs: 'human-1' },
    });
    const plain = await failing({ channelId: 'dm-mira', messageId: 'human-3', picture: true });
    expect(plain).toMatchObject({
      voiceCall: { callId: 'call-0123456789abcdef', atMs: 4_200 },
      attachments: [],
    });
    expect(plain!.voiceCall.visual).toBeUndefined();
    plain!.settle(true);
    expect(settled).toEqual([false]);
  });
});
