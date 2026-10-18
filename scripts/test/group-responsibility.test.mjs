import { it as test } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { inspectEpisodeResponsibility } from '../e2e-group-responsibility.mjs';

test('a delivered response cannot settle an original request still due to resume', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(
    'CREATE TABLE channel_placements(channel_id TEXT,message_id TEXT,source_event_id TEXT); CREATE TABLE inbox_admissions(source_event_id TEXT,bot_slug TEXT,opened_at TEXT,resolved_at TEXT,ignored_at TEXT,snoozed_until TEXT)',
  );
  db.prepare('INSERT INTO channel_placements VALUES(?,?,?)').run('g', 'request', 'source');
  const add = db.prepare('INSERT INTO inbox_admissions VALUES(?,?,?,?,?,?)');
  add.run('source', 'a', 't', null, null, 'future');
  add.run('source', 'silent-peer', null, null, null, null);
  add.run('corrected-delivery', 'a', 't', 't', null, null);
  add.run('unobserved-fyi', 'a', null, null, null, null);
  add.run('unrelated', 'other-bot', 't', null, null, 'future');
  const input = { botSlugs: ['a', 'silent-peer'], channelId: 'g', messageId: 'request' };
  try {
    const pending = inspectEpisodeResponsibility(db, input);
    assert.equal(pending.complete, false);
    assert.equal(pending.pendingCount, 1);
    assert.equal(pending.pending[0].source_event_id, 'source');
    db.prepare(
      'UPDATE inbox_admissions SET resolved_at=? WHERE source_event_id=? AND bot_slug=?',
    ).run('later', 'source', 'a');
    assert.equal(inspectEpisodeResponsibility(db, input).complete, true);
    add.run('observed-fyi', 'silent-peer', 't', null, null, null);
    assert.equal(inspectEpisodeResponsibility(db, input).complete, false);
    db.prepare('UPDATE inbox_admissions SET ignored_at=? WHERE source_event_id=?').run(
      'later',
      'observed-fyi',
    );
    assert.equal(inspectEpisodeResponsibility(db, input).complete, true);
    assert.throws(
      () => inspectEpisodeResponsibility(db, { ...input, messageId: 'missing' }),
      /canonical placement/,
    );
    assert.throws(
      () => inspectEpisodeResponsibility(db, { ...input, botSlugs: ['other-bot'] }),
      /Original request admission/,
    );
  } finally {
    db.close();
  }
});

test('an unread original and pending entries beyond the evidence cap cannot look settled', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(
    'CREATE TABLE channel_placements(channel_id TEXT,message_id TEXT,source_event_id TEXT); CREATE TABLE inbox_admissions(source_event_id TEXT,bot_slug TEXT,opened_at TEXT,resolved_at TEXT,ignored_at TEXT,snoozed_until TEXT)',
  );
  db.prepare('INSERT INTO channel_placements VALUES(?,?,?)').run('g', 'request', 'source');
  const add = db.prepare('INSERT INTO inbox_admissions VALUES(?,?,?,?,?,?)');
  const input = { botSlugs: ['a', 'silent-peer'], channelId: 'g', messageId: 'request' };
  try {
    add.run('source', 'silent-peer', null, null, null, null);
    assert.throws(() => inspectEpisodeResponsibility(db, input), /Acting Bot must own/);
    add.run('source', 'a', null, null, null, null);
    assert.equal(inspectEpisodeResponsibility(db, input).pendingCount, 1);
    for (let n = 0; n < 101; n++) add.run(`fyi-${n}`, 'a', 't', null, null, null);
    const result = inspectEpisodeResponsibility(db, input);
    assert.equal(result.pending.length, 100);
    assert.equal(result.pendingCount, 102);
    assert.equal(result.pendingTruncated, true);
    assert.equal(result.complete, false);
  } finally {
    db.close();
  }
});
