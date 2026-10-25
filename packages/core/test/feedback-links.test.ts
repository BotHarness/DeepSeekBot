import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';
import { feedbackLinks, relatedFeedbackEvents } from '../src/diagnostics/feedback-links.js';

it('resolves a failure notice back to its persisted request and execution', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`
      CREATE TABLE source_events (source_event_id TEXT, channel_id TEXT, message_id TEXT, assignment_session_id TEXT, created_at TEXT, payload_json TEXT);
      CREATE TABLE channel_placements (channel_id TEXT, message_id TEXT, source_event_id TEXT);
      CREATE TABLE channel_output_origins (source_event_id TEXT, session_id TEXT, request_source_event_id TEXT);
      CREATE TABLE assignments (source_event_id TEXT, session_id TEXT);
      INSERT INTO source_events VALUES ('request', 'dm', 'human', NULL, '2026-10-26T00:00:00Z', '{}');
      INSERT INTO channel_placements VALUES ('dm', 'human', 'request'), ('dm', 'failure', 'failure-event');
    `);
    db.prepare('INSERT INTO source_events VALUES (?, ?, ?, NULL, ?, ?)').run(
      'failure-event',
      'dm',
      'failure',
      '2026-10-26T00:00:05Z',
      JSON.stringify({ sessionFailure: { requestMessageId: 'human', sessionId: 's' } }),
    );
    const links = feedbackLinks({ read: (work) => work(db) }, 'dm', ['failure']);
    expect(links.sourceIds).toContain('request');
    expect(links.messages).toContainEqual({ channelId: 'dm', messageId: 'human' });
    expect(links.outputs).toContainEqual({ sessionId: 's', at: '2026-10-26T00:00:05Z' });
    const events = [
      { type: 'turn/start', time: Date.parse('2026-10-26T00:00:01Z'), data: {} },
      { type: 'turn/end', time: Date.parse('2026-10-26T00:00:04Z'), data: {} },
    ];
    expect(relatedFeedbackEvents(events, links, 's')).toEqual(events);
    expect(relatedFeedbackEvents(events, links, 'unrelated')).toEqual([]);
  } finally {
    db.close();
  }
});
