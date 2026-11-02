-- Keep most-starred keyset pagination ordered by freshness before the stable repository ID.
DROP INDEX indexed_repositories_listed_by_stars;
CREATE INDEX indexed_repositories_listed_by_stars
  ON indexed_repositories (visibility, stars DESC, pushed_at DESC, created_at DESC, node_id DESC);
