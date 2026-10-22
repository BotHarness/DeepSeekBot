import type { DesktopInput } from './desktop-view.js';

export const LOCAL_VIDEO_PATH = '/api/computer/video';
export const LOCAL_VIDEO_LIMITS = {
  viewers: 1,
  requestBytes: 128 * 1024,
  pendingRequests: 8,
  signalBytes: 96 * 1024,
  controlLossMs: 6_000,
  controlExpiryMs: 30_000,
  presentationStallMs: 5_000,
  operationTimeoutMs: 10_000,
  cleanupTimeoutMs: 3_000,
} as const;

export interface LocalVideoCaller {
  readonly deviceId: string;
}

export interface LocalVideoBinding {
  readonly computerId: 'local';
  readonly runtimeId: string;
  readonly viewerId: string;
  readonly attemptId: string;
}

export interface LocalVideoDescription {
  readonly type: 'offer' | 'answer';
  readonly sdp: string;
}

export interface LocalVideoMediaStatus {
  readonly status: 'starting' | 'live' | 'stalled' | 'failed' | 'closed';
  readonly captureAlive: boolean;
  readonly width: number;
  readonly height: number;
  readonly framesEncoded?: number;
  readonly bytesSent?: number;
  readonly codec?: string;
  readonly encoderImplementation?: string;
  readonly path?: 'direct' | 'relay' | 'unknown';
  readonly roundTripTimeMs?: number;
  readonly availableOutgoingBitrate?: number;
}

export interface LocalVideoState {
  readonly computerId: 'local';
  readonly runtimeId: string;
  readonly binding?: LocalVideoBinding;
  readonly paused: boolean;
  readonly viewerCount: number;
  readonly controlHeld: boolean;
  readonly controller: boolean;
  readonly grant?: { readonly generation: number; readonly expiresAt: number };
  readonly lastInputSequence: number;
  readonly media: LocalVideoMediaStatus;
  readonly offer?: LocalVideoDescription;
}

export type LocalVideoCommand =
  | { readonly kind: 'status' | 'open' }
  | {
      readonly kind: 'signal';
      readonly binding: LocalVideoBinding;
      readonly answer: LocalVideoDescription;
    }
  | {
      readonly kind: 'heartbeat';
      readonly binding: LocalVideoBinding;
      readonly playback: { readonly presentedFrames: number; readonly presenting: boolean };
    }
  | {
      readonly kind: 'takeover';
      readonly binding: LocalVideoBinding;
      readonly force?: boolean;
      readonly confirm?: boolean;
    }
  | {
      readonly kind: 'input';
      readonly binding: LocalVideoBinding;
      readonly generation: number;
      readonly sequence: number;
      readonly input: DesktopInput;
    }
  | {
      readonly kind: 'release' | 'close';
      readonly binding: LocalVideoBinding;
      readonly generation?: number;
    }
  | {
      readonly kind: 'resume';
      readonly runtimeId: string;
      readonly binding?: LocalVideoBinding;
      readonly generation?: number;
    };

export type LocalVideoRefusal =
  | 'invalid-input'
  | 'update-required'
  | 'not-running'
  | 'not-ready'
  | 'unsupported-platform'
  | 'viewer-limit'
  | 'viewer-not-found'
  | 'stale-attempt'
  | 'stale-grant'
  | 'control-required'
  | 'control-conflict'
  | 'confirmation-required'
  | 'control-disconnected'
  | 'media-not-live'
  | 'pause-write-failed'
  | 'drain-timeout'
  | 'input-failed'
  | 'input-result-unknown'
  | 'input-sequence'
  | 'queue-full'
  | 'request-too-large'
  | 'operation-timeout'
  | 'helper-missing'
  | 'helper-start-failed'
  | 'helper-failed'
  | 'signal-failed'
  | 'device-revoked'
  | 'disposed'
  | 'connect-carrier-required';

export class LocalVideoError extends Error {
  constructor(
    readonly code: LocalVideoRefusal,
    message: string,
  ) {
    super(message);
    this.name = 'LocalVideoError';
  }
}

export type LocalVideoResult =
  | { readonly ok: true; readonly state: LocalVideoState }
  | { readonly ok: false; readonly code: LocalVideoRefusal; readonly error: string };

export interface LocalVideoMedia {
  open(options: {
    readonly binding: LocalVideoBinding;
    readonly signal: AbortSignal;
    readonly onStatus: (status: LocalVideoMediaStatus) => void;
  }): Promise<LocalVideoMediaPeer>;
}

export interface LocalVideoMediaPeer {
  readonly offer: LocalVideoDescription;
  readonly display: { readonly width: number; readonly height: number };
  answer(answer: LocalVideoDescription, signal?: AbortSignal): Promise<void>;

  close(): Promise<void>;
}

export interface LocalVideoOwner {
  handle(
    caller: LocalVideoCaller,
    command: LocalVideoCommand,
    signal?: AbortSignal,
  ): Promise<LocalVideoState>;
  runBotOperation<T>(operation: () => Promise<T>): Promise<T>;
  isPaused(): boolean;
  revoke(deviceId: string): Promise<void>;
  resetRuntime(): Promise<void>;
  dispose(): Promise<void>;
}
