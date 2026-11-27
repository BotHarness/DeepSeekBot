import type { D1Database } from './d1.js';
import { BOT_TOPIC, type GitHubClient } from './github.js';
import { continueDiscovery, findTopicRepositories } from './discovery.js';
import { createRepositoryStore } from './repositories.js';

const NODE_BATCH_SIZE = 100;
const BOT_INDEX_REQUESTS = 6;

export interface DiscoveryReport {
  complete: boolean;
  slices: number;
  found: number;
  added: number;
  hidden: number;
}

export interface RefreshReport {
  batches: number;
  failedBatches: number;
  refreshed: number;
  hidden: number;
}

export function createCrawler(deps: { db: D1Database; github: GitHubClient; now: () => Date }) {
  const { github } = deps;
  const store = createRepositoryStore(deps);

  const refreshIds = async (ids: readonly string[]): Promise<RefreshReport> => {
    const report: RefreshReport = { batches: 0, failedBatches: 0, refreshed: 0, hidden: 0 };
    for (let start = 0; start < ids.length; start += NODE_BATCH_SIZE) {
      const batch = ids.slice(start, start + NODE_BATCH_SIZE);
      report.batches += 1;
      const result = await github.nodes(batch);
      if (!result.ok || result.value.length !== batch.length) {
        report.failedBatches += 1;
        continue;
      }
      for (const [index, node] of result.value.entries()) {
        const id = batch[index];
        if (id === undefined) continue;
        if (node === null) {
          if (await store.hide(id)) report.hidden += 1;
          continue;
        }
        const before = await store.find(node.nodeId);
        const row = await store.index(node, node.head);
        report.refreshed += 1;
        if (before?.visibility === 'listed' && row?.visibility !== 'listed') report.hidden += 1;
      }
    }
    return report;
  };

  return {
    refresh: async (): Promise<RefreshReport> => refreshIds(await store.refreshableIds()),

    async discover(remaining: () => number): Promise<DiscoveryReport> {
      const search = await findTopicRepositories(github, BOT_TOPIC, deps.now());
      const { found, slices } = search;
      const report: DiscoveryReport = {
        complete: false,
        slices,
        found: found.size,
        added: 0,
        hidden: 0,
      };
      const ids = new Set(found.keys());
      if (search.complete) {
        for (const id of await store.listedIds()) ids.add(id);
      }
      const added: string[] = [];
      const complete = await continueDiscovery({
        db: deps.db,
        phase: 'bots',
        ids,
        async visit(id) {
          const repository = found.get(id);
          const available = remaining() - added.length * BOT_INDEX_REQUESTS - 1;
          if (repository === undefined) {
            if (available < 2) return false;
            if (await store.hide(id)) report.hidden += 1;
          } else {
            if (available < 2 * BOT_INDEX_REQUESTS) return false;
            const before = await store.find(id);
            const row = await store.index(repository, undefined);
            if (before === null && row !== null) added.push(id);
          }
          return true;
        },
      });
      report.added = added.length;
      report.complete = search.complete && complete;
      if (added.length > 0) await refreshIds(added);
      return report;
    },
  };
}
