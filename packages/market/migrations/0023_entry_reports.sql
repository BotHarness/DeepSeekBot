CREATE TRIGGER clear_restored_avatar_reports AFTER UPDATE OF visibility ON marketplace_avatars
WHEN NEW.visibility = 'listed'
BEGIN
  DELETE FROM reports WHERE node_id = 'avatar:' || NEW.id;
END;

CREATE TRIGGER clear_deleted_avatar_reports AFTER DELETE ON marketplace_avatars
BEGIN
  DELETE FROM reports WHERE node_id = 'avatar:' || OLD.id;
END;
