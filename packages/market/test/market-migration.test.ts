import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';

it('backfills descriptor tags for existing entries and maintains the index through updates and deletes', () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    const migrations = new URL('../migrations/', import.meta.url);
    for (const file of readdirSync(migrations).sort()) {
      if (file < '0008') sqlite.exec(readFileSync(new URL(file, migrations), 'utf8'));
    }
    sqlite.exec(`INSERT INTO indexed_repositories (
      node_id, owner, name, html_url, clone_url, pushed_at, default_branch,
      visibility, first_seen_at, last_refreshed_at, roles
    ) VALUES (
      'R_existing', 'alice', 'helper', 'https://github.com/alice/helper',
      'https://github.com/alice/helper.git', '2026-10-01', 'main', 'listed',
      '2026-10-01', '2026-10-01', '["translator"]'
    )`);
    const matches = (term: string) =>
      sqlite
        .prepare(
          'SELECT rowid FROM indexed_repositories_fts WHERE indexed_repositories_fts MATCH ?',
        )
        .all(term);
    expect(matches('translator')).toHaveLength(0);

    sqlite.exec(readFileSync(new URL('0008_tag_search.sql', migrations), 'utf8'));
    expect(matches('translator')).toHaveLength(1);
    expect(sqlite.prepare('SELECT roles FROM indexed_repositories').get()).toEqual({
      roles: '["translator"]',
    });

    sqlite.exec(`UPDATE indexed_repositories SET roles = '["illustrator"]'`);
    expect(matches('translator')).toHaveLength(0);
    expect(matches('illustrator')).toHaveLength(1);
    sqlite.exec('DELETE FROM indexed_repositories');
    expect(matches('illustrator')).toHaveLength(0);
  } finally {
    sqlite.close();
  }
});

it('re-crawls existing entries for localized presentation and searches their localized text', () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    const migrations = new URL('../migrations/', import.meta.url);
    for (const file of readdirSync(migrations).sort()) {
      if (file < '0009') sqlite.exec(readFileSync(new URL(file, migrations), 'utf8'));
    }
    sqlite.exec(`INSERT INTO indexed_repositories (
      node_id, owner, name, html_url, clone_url, pushed_at, default_branch,
      visibility, first_seen_at, last_refreshed_at, readme_pushed_at
    ) VALUES (
      'R_existing', 'alice', 'helper', 'https://github.com/alice/helper',
      'https://github.com/alice/helper.git', '2026-10-01', 'main', 'listed',
      '2026-10-01', '2026-10-01', '2026-10-01'
    )`);

    sqlite.exec(readFileSync(new URL('0009_localization.sql', migrations), 'utf8'));
    expect(sqlite.prepare('SELECT readme_pushed_at FROM indexed_repositories').get()).toEqual({
      readme_pushed_at: null,
    });
    sqlite.exec(`UPDATE indexed_repositories SET search_text = '翻译团队聊天'`);
    expect(
      sqlite
        .prepare(
          'SELECT rowid FROM indexed_repositories_fts WHERE indexed_repositories_fts MATCH ?',
        )
        .all('团队聊'),
    ).toHaveLength(1);
  } finally {
    sqlite.close();
  }
});

it('starts existing entries from their first-seen time until a refresh brings GitHub creation time', () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    const migrations = new URL('../migrations/', import.meta.url);
    for (const file of readdirSync(migrations).sort()) {
      if (file < '0010') sqlite.exec(readFileSync(new URL(file, migrations), 'utf8'));
    }
    sqlite.exec(`INSERT INTO indexed_repositories (
      node_id, owner, name, html_url, clone_url, pushed_at, default_branch,
      visibility, first_seen_at, last_refreshed_at
    ) VALUES (
      'R_existing', 'alice', 'helper', 'https://github.com/alice/helper',
      'https://github.com/alice/helper.git', '2026-10-01', 'main', 'listed',
      '2026-09-12T08:00:00.000Z', '2026-10-01'
    )`);

    sqlite.exec(readFileSync(new URL('0010_created.sql', migrations), 'utf8'));
    expect(sqlite.prepare('SELECT created_at FROM indexed_repositories').get()).toEqual({
      created_at: '2026-09-12T08:00:00.000Z',
    });
  } finally {
    sqlite.close();
  }
});
