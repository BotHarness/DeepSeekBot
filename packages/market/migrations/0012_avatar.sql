ALTER TABLE indexed_repositories ADD COLUMN avatar TEXT;
UPDATE indexed_repositories SET readme_pushed_at = NULL;
