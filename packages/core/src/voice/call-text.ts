import type { ChannelAttachmentRef } from '../attachments/ref.js';
import type { AttachmentStore } from '../attachments/store.js';
import type { ChannelCallVisual, ChannelVoiceCallMessage } from '../channels/channel.js';
import type { VoiceCalls, VoiceCallSentVisual } from './calls.js';

export interface CallTextHarvest {
  readonly voiceCall: ChannelVoiceCallMessage;
  readonly attachments: readonly ChannelAttachmentRef[];
  settle(sent: boolean): void;
}

export type CallTextInput = {
  readonly channelId: string;
  readonly messageId: string;
  readonly picture: boolean;
};

export async function callVisualMessage(
  attachments: Pick<AttachmentStore, 'upload'>,
  messageId: string,
  visual: VoiceCallSentVisual | undefined,
): Promise<{ attachments?: ChannelAttachmentRef[]; meta?: ChannelCallVisual }> {
  if (visual === undefined) return {};
  if (!('image' in visual)) return { meta: { source: visual.source, sameAs: visual.sameAs } };
  const image = visual.image.jpeg;
  return {
    attachments: [
      await attachments.upload({
        data: (async function* () {
          yield image;
        })(),
        name: `call-${visual.source}-${messageId.slice(-12)}.jpg`,
      }),
    ],
    meta: {
      source: visual.source,
      frames: visual.frames,
      layout: visual.image.layout,
      fromMs: visual.fromMs,
      toMs: visual.toMs,
      ...(visual.unseen === true ? { unseen: true as const } : {}),
    },
  };
}

export function createCallTextHarvest(deps: {
  readonly calls: () => Pick<VoiceCalls, 'text'> | undefined;
  readonly attachments: Pick<AttachmentStore, 'upload'>;
}): (input: CallTextInput) => Promise<CallTextHarvest | undefined> {
  return async ({ channelId, messageId, picture }) => {
    const harvested = await deps.calls()?.text({ channelId, messageId, picture });
    if (harvested === undefined) return undefined;
    let visual: Awaited<ReturnType<typeof callVisualMessage>>;
    try {
      visual = await callVisualMessage(deps.attachments, messageId, harvested.visual);
    } catch {
      harvested.settle(false);
      return {
        voiceCall: { callId: harvested.callId, atMs: harvested.atMs },
        attachments: [],
        settle: () => {},
      };
    }
    return {
      voiceCall: {
        callId: harvested.callId,
        atMs: harvested.atMs,
        ...(visual.meta === undefined ? {} : { visual: visual.meta }),
      },
      attachments: visual.attachments ?? [],
      settle: (sent) => harvested.settle(sent),
    };
  };
}
