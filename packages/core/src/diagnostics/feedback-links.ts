import type { OperationalDatabaseModulePort } from '../database/owner.js';
import type { DshSessionEvent } from '../sessions/source.js';

export interface FeedbackLinks {
  sourceIds: string[];
  messages: Array<{ channelId: string; messageId: string }>;
  assignments: string[];
  outputs: Array<{ sessionId: string; at: string }>;
}

export function feedbackLinks(
  database: Pick<OperationalDatabaseModulePort, 'read'>,
  channelId: string,
  messageIds: readonly string[],
): FeedbackLinks {
  return database.read((db) => {
    const sources = new Set<string>();
    const messages: FeedbackLinks['messages'] = messageIds.map((messageId) => ({
      channelId,
      messageId,
    }));
    const assignments = new Set<string>();
    const outputs: FeedbackLinks['outputs'] = [];
    for (const messageId of messageIds) {
      const row = db
        .prepare(
          'SELECT source_event_id FROM channel_placements WHERE channel_id = ? AND message_id = ?',
        )
        .get(channelId, messageId);
      if (typeof row?.['source_event_id'] === 'string') sources.add(row['source_event_id']);
    }
    for (const id of sources) {
      if (sources.size > 1000) throw new Error('feedback-relation-limit');
      const event = db
        .prepare(
          `SELECT channel_id, message_id, assignment_session_id, created_at,
             json_extract(payload_json, '$.sessionFailure.requestMessageId') AS request_message_id,
             json_extract(payload_json, '$.sessionFailure.sessionId') AS failure_session_id
           FROM source_events WHERE source_event_id = ?`,
        )
        .get(id);
      if (typeof event?.['channel_id'] === 'string' && typeof event['message_id'] === 'string')
        messages.push({ channelId: event['channel_id'], messageId: event['message_id'] });
      if (typeof event?.['assignment_session_id'] === 'string')
        assignments.add(event['assignment_session_id']);
      if (
        typeof event?.['channel_id'] === 'string' &&
        typeof event['request_message_id'] === 'string'
      ) {
        const request = db
          .prepare(
            'SELECT source_event_id FROM channel_placements WHERE channel_id = ? AND message_id = ?',
          )
          .get(event['channel_id'], event['request_message_id']);
        if (typeof request?.['source_event_id'] === 'string')
          sources.add(request['source_event_id']);
      }
      if (
        typeof event?.['failure_session_id'] === 'string' &&
        typeof event['created_at'] === 'string'
      )
        outputs.push({ sessionId: event['failure_session_id'], at: event['created_at'] });
      const origin = db
        .prepare(
          'SELECT session_id, request_source_event_id FROM channel_output_origins WHERE source_event_id = ?',
        )
        .get(id);
      if (typeof origin?.['request_source_event_id'] === 'string')
        sources.add(origin['request_source_event_id']);
      for (const row of db
        .prepare('SELECT session_id FROM assignments WHERE source_event_id = ?')
        .all(id)) {
        if (typeof row['session_id'] === 'string') assignments.add(row['session_id']);
      }
      for (const row of db
        .prepare(
          `SELECT o.session_id, e.created_at FROM channel_output_origins o JOIN source_events e ON e.source_event_id = o.source_event_id WHERE o.source_event_id = ? OR o.request_source_event_id = ?`,
        )
        .all(id, id)) {
        if (typeof row['session_id'] === 'string' && typeof row['created_at'] === 'string')
          outputs.push({ sessionId: row['session_id'], at: row['created_at'] });
      }
    }
    return { sourceIds: [...sources], messages, assignments: [...assignments], outputs };
  });
}

export function relatedFeedbackEvents(
  events: readonly DshSessionEvent[],
  links: FeedbackLinks,
  sessionId: string,
): DshSessionEvent[] {
  const selected = new Set<number>();
  for (let index = 0; index < events.length; index++) {
    const event = events[index]!;
    if (event.type !== 'user/message') continue;
    const data = event.data;
    if (!data || typeof data !== 'object' || !('content' in data) || !Array.isArray(data.content))
      continue;
    const text = data.content
      .flatMap((part: unknown) =>
        part &&
        typeof part === 'object' &&
        'type' in part &&
        part.type === 'text' &&
        'text' in part &&
        typeof part.text === 'string'
          ? [part.text]
          : [],
      )
      .join('\n');
    if (
      !links.messages.some((message) =>
        text.includes(`Channel: ${message.channelId}\nMessage ID: ${message.messageId}\n`),
      ) &&
      !links.sourceIds.some((id) => text.includes(id))
    )
      continue;
    let first = index;
    for (let previous = index - 1; previous >= 0; previous--) {
      if (events[previous]!.type === 'turn/end') break;
      if (events[previous]!.type === 'turn/start') {
        first = previous;
        break;
      }
    }
    for (let current = first; current < events.length; current++) {
      selected.add(current);
      if (current >= index && events[current]!.type === 'turn/end') break;
    }
  }
  for (const output of links.outputs.filter((item) => item.sessionId === sessionId)) {
    const at = Date.parse(output.at);
    let start: number | undefined;
    for (let index = 0; index < events.length; index++) {
      if (events[index]!.time > at) break;
      if (events[index]!.type === 'turn/start') start = index;
    }
    if (start !== undefined)
      for (let index = start; index < events.length; index++) {
        selected.add(index);
        if (events[index]!.type === 'turn/end') break;
      }
  }
  return events.filter((_, index) => selected.has(index));
}
