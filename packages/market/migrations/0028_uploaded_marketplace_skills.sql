ALTER TABLE marketplace_skills ADD COLUMN upload_account TEXT REFERENCES authors(account);
ALTER TABLE marketplace_skills ADD COLUMN upload_revision TEXT;
ALTER TABLE marketplace_skills ADD COLUMN upload_retired_revision TEXT;
ALTER TABLE marketplace_skills ADD COLUMN upload_deleted INTEGER NOT NULL DEFAULT 0;

CREATE INDEX marketplace_skills_upload_account
  ON marketplace_skills (upload_account) WHERE upload_account IS NOT NULL;

CREATE TRIGGER clear_restored_skill_reports AFTER UPDATE OF visibility ON marketplace_skills
WHEN OLD.visibility = 'blocked' AND NEW.visibility != 'blocked'
BEGIN
  DELETE FROM reports WHERE node_id = 'skill:' || NEW.id;
END;

CREATE TRIGGER clear_deleted_skill_reports AFTER DELETE ON marketplace_skills
BEGIN
  DELETE FROM reports WHERE node_id = 'skill:' || OLD.id;
  DELETE FROM skill_install_receipts WHERE skill_id = OLD.id;
END;
