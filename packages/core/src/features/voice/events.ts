import { attachmentIdentity } from '../../attachments/ref.js';
import {
  ChannelCallReadError,
  resolveChannelCallWindow,
  type ChannelCallWindowRequest,
} from '../../channels/call-window.js';
import type { ChannelMessage, ChannelRecord } from '../../channels/channel.js';
import type { ChannelStore, ChannelMessageQueryOptions } from '../../channels/store.js';
import type { ChannelVoiceCallRecord } from '../../channels/voice-call-record.js';
import type { VoiceCallZoom } from '../../voice/call-contract.js';
import { formatCallDuration } from '../../voice/call-view.js';
import type { VoiceAttachOutcome, VoiceMessages } from '../../voice/messages.js';

export interface VoiceChannelAccess {
  attachVoice?(input: {
    channelId: string;
    messageId: string;
    signal?: AbortSignal;
  }): Promise<VoiceAttachOutcome>;
  callFrame?(input: { channelId?: string; messageId: string; cell: number }): VoiceCallZoom;
}

export interface CallFrameAccess {
  zoom(input: { slug: string; messageId: string; cell: number }): VoiceCallZoom;
}

export function createVoiceAccess({
  botSlug,
  resolve,
  channels,
  voiceMessages,
  callFrames,
}: {
  botSlug: string;
  resolve: (channelId?: string) => ChannelRecord;
  channels: Pick<ChannelStore, 'message'>;
  voiceMessages: Pick<VoiceMessages, 'attach'> | undefined;
  callFrames: CallFrameAccess | undefined;
}): VoiceChannelAccess {
  return {
    ...(voiceMessages === undefined
      ? {}
      : {
          attachVoice: (input: { channelId: string; messageId: string; signal?: AbortSignal }) =>
            voiceMessages.attach({ botSlug, ...input }),
        }),
    ...(callFrames === undefined
      ? {}
      : {
          callFrame: (input: { channelId?: string; messageId: string; cell: number }) => {
            const channel = resolve(input.channelId);
            const message = channels.message(channel.id, input.messageId);
            if (message === undefined)
              throw new Error(`Channel message not found: ${input.messageId}`);
            if (
              message.voiceCallRecord?.state !== 'frames' &&
              (message.voiceCall?.visual === undefined || 'sameAs' in message.voiceCall.visual)
            )
              throw new Error(
                `Message ${input.messageId} carries no call grid; use the message the grid is attached to.`,
              );
            return callFrames.zoom({
              slug: botSlug,
              messageId: input.messageId,
              cell: input.cell,
            });
          },
        }),
  };
}

export function queryCallWindow({
  channels,
  resolve,
  input,
}: {
  channels: Pick<ChannelStore, 'message' | 'queryMessages'>;
  resolve: (channelId?: string) => ChannelRecord;
  input: ChannelMessageQueryOptions &
    ChannelCallWindowRequest & {
      channelId?: string;
      scope?: 'channel' | 'joined';
    };
}) {
  if (input.scope === 'joined')
    throw new ChannelCallReadError(
      'call-range-conflict',
      'call reads one Channel; omit scope joined',
    );
  const channel = resolve(input.channelId);
  const window = resolveChannelCallWindow(
    (messageId) => channels.message(channel.id, messageId),
    input,
  )!;
  const { call: _call, fromMs: _fromMs, toMs: _toMs, ...filters } = input;
  const queryOptions: ChannelMessageQueryOptions = {
    ...filters,
    from: window.startedAt,
    ...(window.endedAt === undefined ? {} : { to: window.endedAt }),
    orderBy: 'time',
    ascending: true,
    callWindow: {
      callId: window.callId,
      fromMs: window.fromMs,
      ...(window.toMs === undefined ? {} : { toMs: window.toMs }),
      from: window.from,
      ...(window.to === undefined ? {} : { to: window.to }),
    },
  };
  const page = channels.queryMessages(channel.id, queryOptions);
  return { channel, window, page, queryOptions };
}

export function lastCallNote(
  channels: Pick<ChannelStore, 'queryMessages'>,
  channelId: string,
  messageId: string,
): string | undefined {
  let record: ChannelVoiceCallRecord | undefined;
  try {
    record = channels.queryMessages(channelId, {
      text: 'voice call',
      authorKind: 'system',
      limit: 1,
    }).messages[0]?.voiceCallRecord;
  } catch {
    return undefined;
  }
  if (record?.state !== 'ended') return undefined;
  let typed: ChannelMessage[];
  try {
    typed = channels
      .queryMessages(channelId, { authorKind: 'human', from: record.endedAt, limit: 50 })
      .messages.filter((item) => item.voiceCall === undefined);
  } catch {
    return undefined;
  }
  if (typed.at(-1)?.id !== messageId) return undefined;
  return `[Last voice call with the Human in this DM: ${record.callId}, from ${record.startedAt} to ${record.endedAt} (${formatCallDuration(record.durationMs)}, ${record.heard} spoken message${record.heard === 1 ? '' : 's'} heard). The Human is typing again now. Read what was said and shown on it with channel_read call=${record.callId}; add from_ms/to_ms (milliseconds from the call's start) for part of it. channel_read text "voice call" with author_kind system lists earlier calls, each read the same way by its callId.]`;
}

export function callTimelineNote(voiceCall: ChannelMessage['voiceCall']): string | undefined {
  if (voiceCall === undefined) return undefined;
  const parts: string[] = [];
  if (voiceCall.speechFromMs !== undefined && voiceCall.speechToMs !== undefined)
    parts.push(
      `this message ${formatCallDuration(voiceCall.speechFromMs)}–${formatCallDuration(voiceCall.speechToMs)}`,
    );
  if (voiceCall.atMs !== undefined) parts.push(`typed at ${formatCallDuration(voiceCall.atMs)}`);
  const visual = voiceCall.visual;
  if (visual !== undefined && 'fromMs' in visual)
    parts.push(`picture ${formatCallDuration(visual.fromMs)}–${formatCallDuration(visual.toMs)}`);
  return parts.length === 0 ? undefined : parts.join(', ');
}

export function callVisualNote(
  channelId: string,
  message: ChannelMessage,
  hint: string,
): string | undefined {
  const visual = message.voiceCall?.visual;
  if (visual === undefined) return undefined;
  if ('sameAs' in visual)
    return `[Call ${visual.source} view] Nothing changed in the Human's ${visual.source} since message ${visual.sameAs}; that message's image is still what they see. To look at it again, open it with channel_read_image, channel_id ${channelId} and message_id ${visual.sameAs}.`;
  const what =
    visual.frames === 1 ? 'one keyframe' : `a ${visual.layout} grid of ${visual.frames} keyframes`;
  const span = `${formatCallDuration(visual.fromMs)}–${formatCallDuration(visual.toMs)}`;
  if (visual.unseen === true)
    return `[Call ${visual.source} view] The Human is sharing their ${visual.source}, and this message keeps ${what} (picture ${span}) for the DM history, but your current model cannot read images, so do not open it. If they ask about what they are showing, tell them you cannot see it with this model and ask them to describe it.`;
  const image = message.attachments?.findLast((ref) => ref.mime === 'image/jpeg');
  if (image === undefined) return undefined;
  const earlier =
    visual.fromMs > 0
      ? ` Anything shown before ${formatCallDuration(visual.fromMs)} on this call is saved as frame records: channel_read with call ${message.voiceCall!.callId} and to_ms ${visual.fromMs}, then channel_read_image on a record.`
      : '';
  return `[Call ${visual.source} view] This message carries ${what} from the Human's ${visual.source}, picture ${span} of the call: channel_read_image with channel_id ${channelId}, message_id ${message.id} and attachment_id ${attachmentIdentity(image)}.${earlier} ${hint}`;
}

export const timelineSuffix = (note: string | undefined) => (note === undefined ? '' : `: ${note}`);
