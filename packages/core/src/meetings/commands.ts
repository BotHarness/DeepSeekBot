import type { OperationalDatabaseModulePort } from '../database/owner.js';
import type { PersonaBotRecord } from '../bots/persona-bot.js';
import { botOwner } from '../team/bot-access.js';
import { MeetingError, type Meetings } from './meetings.js';
import type { MeetingAttendance, MeetingDispatcher, MeetingLine, MeetingStore } from './store.js';

export interface OrchestratorMeetings {
  join(input: { url: string; listenOnly?: boolean }): Promise<MeetingAttendance>;
  leave(): Promise<MeetingAttendance>;
  status(): { live?: MeetingAttendance; recent: MeetingAttendance[] };
  transcript(input: { meetingId?: string; after?: number }): {
    meeting: MeetingAttendance;
    lines: MeetingLine[];
  };
}

interface DispatchSource {
  readonly channelId: string;
  readonly humanId: string;
  readonly name?: string | undefined;
}

function dispatchSource(
  database: OperationalDatabaseModulePort,
  sourceEventId: string | undefined,
): DispatchSource | undefined {
  if (sourceEventId === undefined) return undefined;
  const row = database.read((db) =>
    db
      .prepare(
        `SELECT e.channel_id AS channelId, e.human_id AS humanId,
                COALESCE(n.default_display_name, h.display_name) AS name
         FROM source_events e
         LEFT JOIN humans h ON h.human_id = e.human_id
         LEFT JOIN local_human_names n ON n.human_id = e.human_id
         WHERE e.source_event_id = ? AND e.source_kind = 'human-message'`,
      )
      .get(sourceEventId),
  );
  if (typeof row?.['channelId'] !== 'string' || typeof row['humanId'] !== 'string')
    return undefined;
  return {
    channelId: row['channelId'],
    humanId: row['humanId'],
    ...(typeof row['name'] === 'string' ? { name: row['name'] } : {}),
  };
}

export function bindMeetingCommands(input: {
  readonly meetings: Meetings;
  readonly store: Pick<MeetingStore, 'get' | 'list' | 'lines'>;
  readonly database: OperationalDatabaseModulePort;
  readonly bot: PersonaBotRecord;
  readonly sourceEventId: string | undefined;
  readonly markSideEffect: () => void;
}): OrchestratorMeetings {
  const { meetings, store, bot } = input;
  return {
    async join({ url, listenOnly }) {
      const source = dispatchSource(input.database, input.sourceEventId);
      if (source === undefined || source.humanId !== botOwner(bot))
        throw new MeetingError(
          'needs-owner',
          'Only your Owner can send you to a meeting for now. Ask them to send the link in your DM.',
        );
      const dispatcher: MeetingDispatcher = {
        kind: 'owner',
        id: source.humanId,
        ...(source.name === undefined ? {} : { name: source.name }),
      };
      input.markSideEffect();
      return meetings.join({
        slug: bot.slug,
        url,
        listenOnly: listenOnly === true,
        originChannelId: source.channelId,
        dispatcher,
      });
    },
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
      return { meeting, lines: store.lines(meeting.id, after ?? 0) };
    },
  };
}
