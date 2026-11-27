import { D1RequestBudgetExhausted, type D1Database } from './d1.js';
import { SEARCH_PAGE_SIZE, type GitHubClient, type GitHubRepository } from './github.js';

const SEARCH_RESULT_CAP = 1000;
const DISCOVERY_START = '2008-01-01T00:00:00Z';

function iso(time: number): string {
  return new Date(time).toISOString().replace(/\.\d{3}Z$/u, 'Z');
}

export async function findTopicRepositories(github: GitHubClient, topic: string, now: Date) {
  const found = new Map<string, GitHubRepository>();
  let slices = 0;
  const scan = async (from: number, to: number): Promise<boolean> => {
    const range = { from: iso(from), to: iso(to) };
    const first = await github.searchTopic(topic, range, 1);
    slices += 1;
    if (!first.ok) return false;
    if (first.value.totalCount >= SEARCH_RESULT_CAP && to - from >= 1000) {
      const middle = from + Math.floor((to - from) / 2000) * 1000;
      const left = await scan(from, middle);
      const right = await scan(middle + 1000, to);
      return left && right;
    }
    const ids = new Set<string>();
    const collect = (repositories: GitHubRepository[]) => {
      for (const repository of repositories) {
        found.set(repository.nodeId, repository);
        ids.add(repository.nodeId);
      }
    };
    collect(first.value.repositories);
    if (first.value.incomplete === true) return false;
    const total = Math.min(first.value.totalCount, SEARCH_RESULT_CAP);
    const pages = Math.ceil(total / SEARCH_PAGE_SIZE);
    for (let page = 2; page <= pages; page += 1) {
      const next = await github.searchTopic(topic, range, page);
      if (!next.ok) return false;
      collect(next.value.repositories);
      if (next.value.incomplete === true || next.value.totalCount !== first.value.totalCount)
        return false;
    }
    return total < SEARCH_RESULT_CAP && ids.size === total;
  };
  const complete = await scan(Date.parse(DISCOVERY_START), Math.floor(now.getTime() / 1000) * 1000);
  return { found, slices, complete };
}

export async function continueDiscovery({
  db,
  phase,
  ids,
  visit,
}: {
  db: D1Database;
  phase: 'bots' | 'skills';
  ids: Iterable<string>;
  visit: (id: string) => Promise<boolean>;
}): Promise<{ complete: boolean; skipped: number }> {
  const saved = await db
    .prepare('SELECT repo_node_id FROM discovery_cursors WHERE phase = ?')
    .bind(phase)
    .first<{ repo_node_id: string }>();
  const cursor = saved?.repo_node_id ?? '';
  let next = cursor;
  let complete = true;
  let skipped = 0;
  for (const id of [...ids].sort()) {
    if (id <= cursor) continue;
    try {
      if (!(await visit(id))) {
        complete = false;
        break;
      }
    } catch (error) {
      if (error instanceof D1RequestBudgetExhausted) {
        complete = false;
        break;
      }
      skipped += 1;
    }
    next = id;
  }
  const checkpoint = complete ? '' : next;
  if (checkpoint !== cursor) {
    try {
      await db
        .prepare(`INSERT INTO discovery_cursors (phase, repo_node_id) VALUES (?, ?)
          ON CONFLICT (phase) DO UPDATE SET repo_node_id = excluded.repo_node_id
          WHERE discovery_cursors.repo_node_id = ?`)
        .bind(phase, checkpoint, cursor)
        .run();
    } catch (error) {
      if (!(error instanceof D1RequestBudgetExhausted)) throw error;
      complete = false;
    }
  }
  return { complete, skipped };
}
