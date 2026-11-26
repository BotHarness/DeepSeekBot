import type { VoiceCallEndReason } from '../voice/call-contract.js';
import type {
  MeetingAttendance,
  MeetingDispatcher,
  MeetingEndReason,
  MeetingPlatform,
  MeetingStore,
} from './store.js';

export const MEETING_LIMITS = {
  maxDurationMs: 4 * 60 * 60_000,
} as const;

export type MeetingErrorCode = 'already-in-meeting' | 'not-in-meeting' | 'needs-owner';

export class MeetingError extends Error {
  constructor(
    readonly code: MeetingErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface MeetingsDeps {
  readonly store: MeetingStore;
  readonly stopCall: (callId: string) => Promise<void>;
  readonly admitted: (slug: string) => void;
  readonly log?: (phase: string, fields: Record<string, string | number>) => void;
  readonly limits?: Partial<typeof MEETING_LIMITS>;
}

export interface MeetingBeginInput {
  readonly slug: string;
  readonly callId: string;
  readonly platform: MeetingPlatform;
  readonly originChannelId?: string | undefined;
  readonly dispatcher: MeetingDispatcher;
}

export interface Meetings {
  begin(input: MeetingBeginInput): MeetingAttendance;
  callEnded(attendanceId: string, reason: VoiceCallEndReason): void;
  leave(slug: string): Promise<MeetingAttendance>;
  status(slug: string): { live?: MeetingAttendance; recent: MeetingAttendance[] };
  hear(attendanceId: string, body: string): void;
  dispose(): void;
}

const CALL_END_REASONS: Partial<Record<VoiceCallEndReason, MeetingEndReason>> = {
  hangup: 'owner-stopped',
  'host-stopped': 'host-stopped',
};

export function createMeetings(deps: MeetingsDeps): Meetings {
  const limits = { ...MEETING_LIMITS, ...deps.limits };
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const log = deps.log ?? (() => undefined);

  const stopping = new Map<string, MeetingEndReason>();

  const end = (attendanceId: string, state: 'left' | 'failed', reason: MeetingEndReason) => {
    clearTimeout(timers.get(attendanceId));
    timers.delete(attendanceId);
    const meeting = deps.store.get(attendanceId);
    const ended = deps.store.end(attendanceId, state, reason);
    if (meeting === undefined || ended === undefined) return;
    log('meeting-ended', { meeting: attendanceId, bot: meeting.botSlug, reason });
    if (ended.wake) deps.admitted(meeting.botSlug);
  };

  const stop = async (meeting: MeetingAttendance, reason: MeetingEndReason) => {
    stopping.set(meeting.id, reason);
    try {
      await deps.stopCall(meeting.callId);
    } finally {
      stopping.delete(meeting.id);
    }
    if (deps.store.get(meeting.id)?.state === 'in-meeting') end(meeting.id, 'left', reason);
  };

  const expire = (meeting: MeetingAttendance) => {
    stop(meeting, 'time-limit').catch((error: unknown) => {
      log('meeting-stop-failed', { meeting: meeting.id, error: String(error).slice(0, 200) });
      const retry = setTimeout(() => expire(meeting), 30_000);
      retry.unref?.();
      timers.set(meeting.id, retry);
    });
  };

  return {
    begin(input) {
      if (deps.store.live(input.slug) !== undefined)
        throw new MeetingError('already-in-meeting', 'This Bot is already in a meeting.');
      const meeting = deps.store.create({
        botSlug: input.slug,
        platform: input.platform,
        callId: input.callId,
        ...(input.originChannelId === undefined ? {} : { originChannelId: input.originChannelId }),
        dispatcher: input.dispatcher,
      });
      const timer = setTimeout(() => expire(meeting), limits.maxDurationMs);
      timer.unref?.();
      timers.set(meeting.id, timer);
      log('meeting-started', { meeting: meeting.id, bot: input.slug, call: input.callId });
      return meeting;
    },
    callEnded(attendanceId, reason) {
      const asked = stopping.get(attendanceId);
      if (asked !== undefined) return end(attendanceId, 'left', asked);
      const mapped = CALL_END_REASONS[reason] ?? 'audio-lost';
      end(attendanceId, mapped === 'owner-stopped' ? 'left' : 'failed', mapped);
    },
    async leave(slug) {
      const meeting = deps.store.live(slug);
      if (meeting === undefined)
        throw new MeetingError('not-in-meeting', 'This Bot is not in a meeting.');
      await stop(meeting, 'asked-to-leave');
      return deps.store.get(meeting.id) ?? meeting;
    },
    status(slug) {
      const current = deps.store.live(slug);
      return {
        ...(current === undefined ? {} : { live: current }),
        recent: deps.store.list(slug, 5),
      };
    },
    hear(attendanceId, body) {
      const heard = deps.store.hear(attendanceId, { body });
      if (heard?.wake !== true) return;
      const meeting = deps.store.get(attendanceId);
      if (meeting !== undefined) deps.admitted(meeting.botSlug);
    },
    dispose() {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    },
  };
}
