function inboxHistoryIndexSql(attachmentNames: string): string {
  return `
  CREATE VIEW inbox_history_documents AS
  SELECT e.rowid AS rowid, e.source_event_id,
    trim(e.body || ' ' ||${attachmentNames}
      CASE WHEN json_type(e.payload_json, '$.memoryCommit') IS NOT NULL THEN
        'Memory commit 记忆提交 ' ||
        coalesce(json_extract(e.payload_json, '$.memoryCommit.subject'), '') || ' ' ||
        coalesce(json_extract(e.payload_json, '$.memoryCommit.authorName'), '') || ' ' ||
        coalesce(json_extract(e.payload_json, '$.memoryCommit.files'), '')
      WHEN json_type(e.payload_json, '$.botDmAction') IS NOT NULL THEN
        'Sent a direct message 发送了私聊消息 ' ||
        coalesce(json_extract(e.payload_json, '$.botDmAction.recipientBotSlug'), '')
      ELSE '' END) AS search_text
  FROM source_events e
  WHERE NOT EXISTS (
    SELECT 1 FROM messaging_purge_facts p WHERE p.source_event_id IN
      (e.source_event_id, json_extract(e.payload_json, '$.botCausation.rootSourceEventId'),
       json_extract(e.payload_json, '$.botCausation.parentSourceEventId'),
       json_extract(e.payload_json, '$.causeSourceEventId'))
  );
  CREATE VIRTUAL TABLE inbox_history_fts USING fts5(
    search_text, content='inbox_history_documents', content_rowid='rowid', tokenize='trigram'
  );
  INSERT INTO inbox_history_fts(inbox_history_fts, rank) VALUES ('secure-delete', 1);
  CREATE TRIGGER inbox_history_insert AFTER INSERT ON source_events BEGIN
    INSERT INTO inbox_history_fts(rowid, search_text)
      SELECT rowid, search_text FROM inbox_history_documents WHERE rowid = NEW.rowid;
  END;
  CREATE TRIGGER inbox_history_before_update BEFORE UPDATE OF body, payload_json, source_event_id ON source_events BEGIN
    INSERT INTO inbox_history_fts(inbox_history_fts, rowid, search_text)
      SELECT 'delete', rowid, search_text FROM inbox_history_documents WHERE rowid = OLD.rowid;
  END;
  CREATE TRIGGER inbox_history_after_update AFTER UPDATE OF body, payload_json, source_event_id ON source_events BEGIN
    INSERT INTO inbox_history_fts(rowid, search_text)
      SELECT rowid, search_text FROM inbox_history_documents WHERE rowid = NEW.rowid;
  END;
  CREATE TRIGGER inbox_history_delete BEFORE DELETE ON source_events BEGIN
    INSERT INTO inbox_history_fts(inbox_history_fts, rowid, search_text)
      SELECT 'delete', rowid, search_text FROM inbox_history_documents WHERE rowid = OLD.rowid;
  END;
  CREATE TRIGGER inbox_history_purge BEFORE INSERT ON messaging_purge_facts BEGIN
    INSERT INTO inbox_history_fts(inbox_history_fts, rowid, search_text)
      SELECT 'delete', d.rowid, d.search_text FROM inbox_history_documents d
      JOIN source_events e ON e.source_event_id = d.source_event_id
      WHERE NEW.source_event_id IN
        (e.source_event_id, json_extract(e.payload_json, '$.botCausation.rootSourceEventId'),
         json_extract(e.payload_json, '$.botCausation.parentSourceEventId'),
         json_extract(e.payload_json, '$.causeSourceEventId'));
  END;
  INSERT INTO inbox_history_fts(inbox_history_fts) VALUES ('rebuild');
`;
}

export const INBOX_HISTORY_INDEX_SQL = inboxHistoryIndexSql('');

// Triggers cannot read json_each, so the names come from fixed positions: a message carries at
// most ten attachments.
const ATTACHMENT_NAMES_SQL = Array.from(
  { length: 10 },
  (_, index) => `
      coalesce(json_extract(e.payload_json, '$.attachments[${index}].name') || ' ', '') ||`,
).join('');

/** Generation 112 also indexes each attachment's file name, so global message search finds files. */
export const MESSAGE_SEARCH_INDEX_SQL = `
  DROP TRIGGER inbox_history_insert;
  DROP TRIGGER inbox_history_before_update;
  DROP TRIGGER inbox_history_after_update;
  DROP TRIGGER inbox_history_delete;
  DROP TRIGGER inbox_history_purge;
  DROP TABLE inbox_history_fts;
  DROP VIEW inbox_history_documents;
  ${inboxHistoryIndexSql(ATTACHMENT_NAMES_SQL)}
`;
