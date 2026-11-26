import type { PersonaBotRecord } from '../bots/persona-bot.js';
import { MeetingError, type Meetings } from './meetings.js';
import {
  TRANSCRIPT_PAGE,
  type MeetingAttendance,
  type MeetingLine,
  type MeetingStore,
} from './store.js';

export interface OrchestratorMeetings {
  leave(): Promise<MeetingAttendance>;
  status(): { live?: MeetingAttendance; recent: MeetingAttendance[] };
  transcript(input: { meetingId?: string; after?: number }): {
    meeting: MeetingAttendance;
    lines: MeetingLine[];
    more: boolean;
  };
}

export function bindMeetingCommands(input: {
  readonly meetings: Meetings;
  readonly store: Pick<MeetingStore, 'get' | 'list' | 'lines'>;
  readonly bot: Pick<PersonaBotRecord, 'slug'>;
  readonly markSideEffect: () => void;
}): OrchestratorMeetings {
  const { meetings, store, bot } = input;
  return {
    async leave() {
      input.markSideEffect();
      return meetings.leave(bot.slug);
    },
    status() {
      return meetings.status(bot.slug);
    },
    transcript({ meetingId, after }) {
      const meeting = meetingId === undefined ? store.list(bot.slug, 1)[0] : store.get(meetingId);
      if (meeting === undefined || meeting.botSlug !== bot.slug)
        throw new MeetingError('not-in-meeting', 'No meeting with that id for this Bot.');
      const lines = store.lines(meeting.id, after ?? 0, TRANSCRIPT_PAGE + 1);
      return {
        meeting,
        lines: lines.slice(0, TRANSCRIPT_PAGE),
        more: lines.length > TRANSCRIPT_PAGE,
      };
    },
  };
}
