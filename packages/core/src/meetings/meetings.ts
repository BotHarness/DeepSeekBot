import type { VoiceCallEndReason, VoiceCallRefusal } from '../voice/call-contract.js';
import { CallRefusal } from '../voice/calls-command.js';
import type { VoiceCallMeetingLeg, VoiceCalls } from '../voice/calls-types.js';
import type {
  MeetingAttendance,
  MeetingDispatcher,
  MeetingEndReason,
  MeetingPlatform,
  MeetingStore,
} from './store.js';

export const MEETING_LIMITS = {
  admissionWaitMs: 10 * 60_000,
  maxDurationMs: 4 * 60 * 60_000,
  aloneMs: 2 * 60_000,
} as const;

export type MeetingErrorCode =
  | 'invalid-url'
  | 'unsupported-platform'
  | 'unknown-bot'
  | 'bot-paused'
  | 'asr-not-configured'
  | 'already-in-meeting'
  | 'not-in-meeting'
  | 'needs-owner'
  | 'call-active'
  | 'calls-full'
  | 'join-failed';

export class MeetingError extends Error {
  constructor(
    readonly code: MeetingErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface MeetingFarEndSession {
  leave(): Promise<void>;
  speaker?(): string | undefined;
  sendChat?(text: string): Promise<void>;
}

export interface MeetingFarEndHandlers {
  readonly onPcm: (samples: Int16Array) => void;
  readonly onAdmitted: () => void;
  readonly onEnded: (reason: 'meeting-ended' | 'alone' | 'not-admitted' | 'audio-lost') => void;
}

export interface MeetingFarEnd {
  readonly platform: MeetingPlatform;
  matches(url: URL): boolean;
  join(input: {
    readonly attendanceId: string;
    readonly url: URL;
    readonly displayName: string;
    readonly signal: AbortSignal;
    readonly handlers: MeetingFarEndHandlers;
  }): Promise<MeetingFarEndSession>;
}

export interface MeetingBot {
  readonly displayName: string;
  readonly paused?: boolean | undefined;
  readonly asr?: { readonly providerId: string } | undefined;
}

export interface MeetingsDeps {
  readonly store: MeetingStore;
  readonly calls: () => Pick<VoiceCalls, 'attend'> | undefined;
  readonly farEnds: () => readonly MeetingFarEnd[];
  readonly bot: (slug: string) => MeetingBot | undefined;
  readonly hasAsr: (providerId: string) => boolean;
  readonly admitted: (slug: string) => void;
  readonly log?: (phase: string, fields: Record<string, string | number>) => void;
  readonly limits?: Partial<typeof MEETING_LIMITS>;
}

export interface MeetingJoinInput {
  readonly slug: string;
  readonly url: string;
  readonly listenOnly?: boolean | undefined;
  readonly originChannelId?: string | undefined;
  readonly dispatcher: MeetingDispatcher;
}

export interface Meetings {
  join(input: MeetingJoinInput): Promise<MeetingAttendance>;
  leave(slug: string, reason?: MeetingEndReason): Promise<MeetingAttendance>;
  status(slug: string): { live?: MeetingAttendance; recent: MeetingAttendance[] };
  hear(attendanceId: string, body: string): void;
  dispose(): Promise<void>;
}

interface Live {
  readonly attendanceId: string;
  readonly slug: string;
  readonly abort: AbortController;
  session?: MeetingFarEndSession;
  leg?: VoiceCallMeetingLeg;
  admitted: boolean;
  timers: ReturnType<typeof setTimeout>[];
  finishing?: Promise<void>;
}

const CALL_REFUSALS: Partial<Record<VoiceCallRefusal, MeetingErrorCode>> = {
  'call-active': 'call-active',
  'calls-full': 'calls-full',
  'asr-not-configured': 'asr-not-configured',
  'bot-paused': 'bot-paused',
  'unknown-bot': 'unknown-bot',
};

export function meetingUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new MeetingError('invalid-url', 'Pass the meeting link as a full https URL.');
  }
  if (url.username !== '' || url.password !== '')
    throw new MeetingError('invalid-url', 'A meeting link must not carry credentials.');
  return url;
}

export function createMeetings(deps: MeetingsDeps): Meetings {
  const limits = { ...MEETING_LIMITS, ...deps.limits };
  const live = new Map<string, Live>();
  const log = deps.log ?? (() => undefined);

  const finish = (entry: Live, state: 'left' | 'failed', reason: MeetingEndReason) => {
    entry.finishing ??= (async () => {
      for (const timer of entry.timers) clearTimeout(timer);
      entry.abort.abort();
      live.delete(entry.slug);
      const ended = deps.store.end(entry.attendanceId, state, reason);
      log('meeting-ended', { meeting: entry.attendanceId, bot: entry.slug, reason });
      if (ended?.admitted === true) deps.admitted(entry.slug);
      await entry.leg?.end('hangup').catch(() => undefined);
      await entry.session?.leave().catch(() => undefined);
    })();
    return entry.finishing;
  };

  const legEnded = (entry: Live) => (reason: VoiceCallEndReason) => {
    if (entry.finishing !== undefined || reason === 'hangup') return;
    void finish(entry, 'failed', reason === 'host-stopped' ? 'host-stopped' : 'audio-lost');
  };

  const admittedToMeeting = (entry: Live) => {
    if (entry.finishing !== undefined || entry.admitted) return;
    entry.admitted = true;
    for (const timer of entry.timers) clearTimeout(timer);
    entry.timers = [
      setTimeout(() => void finish(entry, 'left', 'time-limit'), limits.maxDurationMs),
    ];
    for (const timer of entry.timers) timer.unref?.();
    deps.store.joined(entry.attendanceId);
    log('meeting-joined', { meeting: entry.attendanceId, bot: entry.slug });
  };

  return {
    async join(input) {
      const url = meetingUrl(input.url);
      if (url.protocol !== 'https:' && url.protocol !== 'synthetic:')
        throw new MeetingError('invalid-url', 'Pass the meeting link as a full https URL.');
      const farEnd = deps.farEnds().find((candidate) => candidate.matches(url));
      if (farEnd === undefined)
        throw new MeetingError(
          'unsupported-platform',
          'This Host cannot join meetings at that address yet. Zoom links are supported first.',
        );
      const bot = deps.bot(input.slug);
      if (bot === undefined)
        throw new MeetingError('unknown-bot', `unknown PersonaBot: ${input.slug}`);
      if (bot.paused === true) throw new MeetingError('bot-paused', 'This Bot is paused.');
      if (bot.asr === undefined || !deps.hasAsr(bot.asr.providerId))
        throw new MeetingError(
          'asr-not-configured',
          'Bind a speech recognition (ASR) Provider to this Bot before sending it to a meeting.',
        );
      if (live.has(input.slug) || deps.store.live(input.slug) !== undefined)
        throw new MeetingError('already-in-meeting', 'This Bot is already in a meeting.');
      const attendance = deps.store.create({
        botSlug: input.slug,
        platform: farEnd.platform,
        url: url.toString(),
        listenOnly: input.listenOnly === true,
        ...(input.originChannelId === undefined ? {} : { originChannelId: input.originChannelId }),
        dispatcher: input.dispatcher,
      });
      const entry: Live = {
        attendanceId: attendance.id,
        slug: input.slug,
        abort: new AbortController(),
        admitted: false,
        timers: [],
      };
      live.set(input.slug, entry);
      const calls = deps.calls();
      try {
        if (calls === undefined)
          throw new MeetingError('join-failed', 'Calls are not running on this Host.');
        entry.leg = await calls.attend({
          slug: input.slug,
          meetingId: attendance.id,
          onEnded: (reason) => legEnded(entry)(reason),
        });
      } catch (error) {
        await finish(entry, 'failed', 'join-failed');
        if (error instanceof MeetingError) throw error;
        const code = error instanceof CallRefusal ? CALL_REFUSALS[error.code] : undefined;
        if (code !== undefined) throw new MeetingError(code, (error as Error).message);
        throw new MeetingError('join-failed', 'The Bot could not start listening.');
      }
      const keepAlive = setInterval(() => {
        if (!entry.admitted) entry.leg?.touch();
      }, 1_000);
      keepAlive.unref?.();
      entry.abort.signal.addEventListener('abort', () => clearInterval(keepAlive), { once: true });
      entry.timers.push(
        setTimeout(() => {
          if (!entry.admitted) void finish(entry, 'failed', 'not-admitted');
        }, limits.admissionWaitMs),
      );
      for (const timer of entry.timers) timer.unref?.();
      log('meeting-joining', {
        meeting: attendance.id,
        bot: input.slug,
        platform: farEnd.platform,
      });
      try {
        entry.session = await farEnd.join({
          attendanceId: attendance.id,
          url,
          displayName:
            input.dispatcher.name === undefined
              ? `${bot.displayName} (Bot)`
              : `${bot.displayName} (${input.dispatcher.name}'s Bot)`,
          signal: entry.abort.signal,
          handlers: {
            onPcm: (samples) => {
              if (entry.admitted) entry.leg?.hear(samples);
            },
            onAdmitted: () => admittedToMeeting(entry),
            onEnded: (reason) =>
              void finish(entry, reason === 'not-admitted' ? 'failed' : 'left', reason),
          },
        });
      } catch (error) {
        log('meeting-join-failed', { meeting: attendance.id, error: String(error).slice(0, 200) });
        await finish(entry, 'failed', 'join-failed');
        throw new MeetingError('join-failed', 'The Bot could not open the meeting page.');
      }
      if (entry.finishing !== undefined) await entry.session.leave().catch(() => undefined);
      return deps.store.get(attendance.id) ?? attendance;
    },
    async leave(slug, reason = 'asked-to-leave') {
      const entry = live.get(slug);
      if (entry === undefined) {
        const stale = deps.store.live(slug);
        if (stale === undefined)
          throw new MeetingError('not-in-meeting', 'This Bot is not in a meeting.');
        const ended = deps.store.end(stale.id, 'failed', 'host-stopped');
        if (ended?.admitted === true) deps.admitted(slug);
        return deps.store.get(stale.id) ?? stale;
      }
      await finish(entry, 'left', reason);
      return deps.store.get(entry.attendanceId)!;
    },
    status(slug) {
      const current = deps.store.live(slug);
      return {
        ...(current === undefined ? {} : { live: current }),
        recent: deps.store.list(slug, 5),
      };
    },
    hear(attendanceId, body) {
      const entry = [...live.values()].find((item) => item.attendanceId === attendanceId);
      if (entry === undefined) return;
      const speaker = entry.session?.speaker?.();
      const heard = deps.store.hear(attendanceId, {
        ...(speaker === undefined ? {} : { speaker }),
        body,
      });
      if (heard?.admitted === true) deps.admitted(entry.slug);
    },
    async dispose() {
      await Promise.all([...live.values()].map((entry) => finish(entry, 'failed', 'host-stopped')));
    },
  };
}
