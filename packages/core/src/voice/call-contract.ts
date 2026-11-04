import type { CallGridLayout, CallVisualSource } from './keyframes.js';

export type { CallGridLayout, CallVisualSource } from './keyframes.js';

export const VOICE_CALL_PATH = '/api/voice/call';

export const VOICE_CALL_HOST_OWNER = 'host-owner';

export const VOICE_CALL_LIMITS = {
  requestBytes: 768 * 1024,
  frameBytes: 512 * 1024,
  pendingFrames: 32,
  keptFrames: 64,
  signalBytes: 96 * 1024,
  injectBytes: 88 * 1024,
  pendingRequests: 8,
  operationTimeoutMs: 10_000,
  heartbeatLossMs: 8_000,
  connectTimeoutMs: 20_000,
  heartbeatMs: 1_000,
  events: 256,
  maxUtteranceMs: 30_000,
  playbackTailMs: 300,
} as const;

export type VoiceCallPhase =
  | 'connecting'
  | 'listening'
  | 'user-speaking'
  | 'transcribing'
  | 'bot-speaking'
  | 'ended';

export type VoiceCallEndReason =
  | 'hangup'
  | 'connection-lost'
  | 'connect-timeout'
  | 'media-failed'
  | 'replaced'
  | 'bot-unavailable'
  | 'host-stopped';

export type VoiceCallEvent =
  | { seq: number; at: number; type: 'connected' }
  | { seq: number; at: number; type: 'speech-start' }
  | { seq: number; at: number; type: 'hearing'; text: string }
  | { seq: number; at: number; type: 'noise-discarded'; durationMs: number }
  | { seq: number; at: number; type: 'transcribing'; audioMs: number }
  | { seq: number; at: number; type: 'nothing-heard' }
  | {
      seq: number;
      at: number;
      type: 'sent';
      messageId: string;
      text: string;
      asrMs: number;
      streamed?: boolean;
      segments?: number;
    }
  | { seq: number; at: number; type: 'asr-failed'; code: string; message: string }
  | { seq: number; at: number; type: 'send-failed'; code: string; message: string }
  | { seq: number; at: number; type: 'ack'; ms: number }
  | { seq: number; at: number; type: 'reply-text'; replyId: string; responseMs?: number }
  | {
      seq: number;
      at: number;
      type: 'playing';
      replyId: string;
      sentence: number;
      messageId?: string;
      bytes: number;
      responseMs?: number;
    }
  | {
      seq: number;
      at: number;
      type: 'played';
      replyId: string;
      sentence: number;
      messageId?: string;
    }
  | {
      seq: number;
      at: number;
      type: 'playback-failed';
      replyId: string;
      sentence: number;
      messageId?: string;
      code: string;
    }
  | {
      seq: number;
      at: number;
      type: 'committed';
      replyId: string;
      messageId: string;
      reused: number;
      synthesized: number;
    }
  | {
      seq: number;
      at: number;
      type: 'reply-stopped';
      replyId: string;
      reason: 'abandoned' | 'revised' | 'replaced';
    }
  | {
      seq: number;
      at: number;
      type: 'reply-done';
      replyId: string;
      messageId: string;
      sentences: number;
    }
  | { seq: number; at: number; type: 'busy' }
  | { seq: number; at: number; type: 'idle' }
  | { seq: number; at: number; type: 'muted' }
  | { seq: number; at: number; type: 'unmuted' }
  | {
      seq: number;
      at: number;
      type: 'visual';
      source: CallVisualSource | 'off';
      unsaved?: true;
    }
  | {
      seq: number;
      at: number;
      type: 'frame-received';
      source: CallVisualSource;
      bytes: number;
      width: number;
      height: number;
      score: number;
      prepareMs: number;
      skipped?: number;
    }
  | {
      seq: number;
      at: number;
      type: 'grid-built';
      source: CallVisualSource;
      frames: number;
      dropped: number;
      layout: CallGridLayout;
      bytes: number;
      composeMs: number;
    }
  | {
      seq: number;
      at: number;
      type: 'grid-sent';
      messageId: string;
      layout: CallGridLayout;
      waitedMs: number;
    }
  | { seq: number; at: number; type: 'grid-unchanged'; messageId: string; sameAs: string }
  | { seq: number; at: number; type: 'grid-failed'; message: string }
  | { seq: number; at: number; type: 'frame-zoomed'; messageId: string; cell: number; ms: number }
  | {
      seq: number;
      at: number;
      type: 'frame-record';
      messageId: string;
      source: CallVisualSource;
      frames: number;
      layout: CallGridLayout;
      bytes: number;
      composeMs: number;
      fromMs: number;
      toMs: number;
    }
  | { seq: number; at: number; type: 'ended'; reason: VoiceCallEndReason };

export interface VoiceCallDescription {
  readonly type: 'offer' | 'answer';
  readonly sdp: string;
}

export interface VoiceCallView {
  readonly callId: string;
  readonly slug: string;
  readonly channelId: string;
  readonly phase: VoiceCallPhase;
  readonly muted: boolean;
  readonly busy: boolean;
  readonly media: 'webrtc' | 'synthetic';
  readonly visual?: CallVisualSource | 'off';
  readonly startedAt: number;
  readonly durationMs: number;
  readonly endReason?: VoiceCallEndReason;
  readonly offer?: VoiceCallDescription;
  readonly events: readonly VoiceCallEvent[];
  readonly lastSeq: number;
}

export type VoiceCallMissing =
  | 'bot'
  | 'asr'
  | 'tts'
  | 'media-unsupported'
  | 'media-helper-missing'
  | 'media-unavailable'
  | 'local-voice-off';

export interface VoiceCallReadiness {
  readonly slug: string;
  readonly ready: boolean;
  readonly missing: readonly VoiceCallMissing[];
  readonly asrProviderId: string | null;
  readonly ttsProviderId: string | null;
  readonly media: 'ready' | 'unsupported-platform' | 'helper-missing' | 'unavailable';
  readonly activeCallId: string | null;
  readonly callElsewhere: boolean;
}

export type VoiceCallCommand =
  | { readonly kind: 'readiness'; readonly slug: string }
  | { readonly kind: 'status' }
  | { readonly kind: 'open'; readonly slug: string; readonly media?: 'webrtc' | 'synthetic' }
  | {
      readonly kind: 'signal';
      readonly callId: string;
      readonly answer: VoiceCallDescription;
    }
  | { readonly kind: 'heartbeat'; readonly callId: string; readonly after?: number }
  | { readonly kind: 'mute'; readonly callId: string; readonly muted: boolean }
  | {
      readonly kind: 'inject';
      readonly callId: string;
      readonly pcm: string;
      readonly after?: number;
    }
  | {
      readonly kind: 'visual';
      readonly callId: string;
      readonly source: CallVisualSource | 'off';
      readonly save?: boolean;
    }
  | {
      readonly kind: 'frame';
      readonly callId: string;
      readonly source: CallVisualSource;
      readonly jpeg: string;
      readonly score?: number;
      readonly skipped?: number;
      readonly after?: number;
    }
  | { readonly kind: 'hangup'; readonly callId: string }
  | { readonly kind: 'zoom'; readonly messageId: string; readonly cell: number };

export type VoiceCallRefusal =
  | 'invalid-input'
  | 'not-ready'
  | 'unknown-bot'
  | 'bot-paused'
  | 'asr-not-configured'
  | 'tts-not-configured'
  | 'media-unsupported'
  | 'media-helper-missing'
  | 'media-failed'
  | 'call-active'
  | 'call-not-found'
  | 'call-ended'
  | 'signal-failed'
  | 'synthetic-only'
  | 'request-too-large'
  | 'queue-full'
  | 'operation-timeout'
  | 'connect-carrier-required'
  | 'device-revoked'
  | 'visual-off'
  | 'frame-invalid'
  | 'cell-invalid';

export type VoiceCallResult =
  | {
      readonly ok: true;
      readonly call?: VoiceCallView;
      readonly calls?: readonly VoiceCallView[];
      readonly readiness?: VoiceCallReadiness;
      readonly zoom?: VoiceCallZoomView;
    }
  | { readonly ok: false; readonly code: VoiceCallRefusal; readonly error: string };

export const VOICE_CALL_CONNECT_REFUSAL: VoiceCallResult = {
  ok: false,
  code: 'connect-carrier-required',
  error: 'Calls need the paired LAN route or Tailscale; Tobs Connect does not carry calls.',
};

export type VoiceCallZoom =
  | { readonly released: true; readonly messageId: string; readonly cell: number }
  | {
      readonly released: false;
      readonly messageId: string;
      readonly cell: number;
      readonly cells: number;
      readonly source: CallVisualSource;
      readonly jpeg: Uint8Array;
      readonly width: number;
      readonly height: number;
    };

export type VoiceCallZoomView =
  | { readonly released: true; readonly messageId: string; readonly cell: number }
  | {
      readonly released: false;
      readonly messageId: string;
      readonly cell: number;
      readonly cells: number;
      readonly source: CallVisualSource;
      readonly width: number;
      readonly height: number;
      readonly bytes: number;
      readonly jpeg: string;
    };
