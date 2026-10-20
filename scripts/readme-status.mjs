import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { renderStatus } from './readme-art.mjs';

export const REPOSITORY = 'BotHarness/DeepSeekBot';
export const STATUS_BRANCH = 'readme-status';
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const MARKER = '<!-- deepseekbot-readme-status:v1 -->';
const FILES = [
  'stats-zh-day.svg',
  'stats-zh-night.svg',
  'stats-en-day.svg',
  'stats-en-night.svg',
  'stats.json',
  'README.md',
  'Fusion-Pixel-OFL.txt',
];

export function githubClient(token, request = fetch) {
  return async (path, method = 'GET', body) => {
    const response = await request(`https://api.github.com/${path}`, {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      const error = new Error(`GitHub ${method} ${path.split('?')[0]}: HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return response.json();
  };
}

function count(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid count: ${label}`);
  return value;
}

export function activityWindow(now = new Date()) {
  const until = new Date(Math.floor(now.getTime() / 1000) * 1000)
    .toISOString()
    .replace('.000Z', 'Z');
  const since = new Date(new Date(until).getTime() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .replace('.000Z', 'Z');
  return { since, until };
}

export async function collectStatus({
  api,
  git = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim(),
  now = new Date(),
}) {
  const repo = await api(`repos/${REPOSITORY}`);
  if (repo.full_name !== REPOSITORY) throw new Error('Unexpected repository');
  if (git(['rev-parse', '--is-shallow-repository']) !== 'false')
    throw new Error('Full default-branch history is required');
  const defaultBranchSha = git([
    'rev-parse',
    '--verify',
    `refs/remotes/origin/${repo.default_branch}^{commit}`,
  ]);
  if (!/^[a-f0-9]{40}$/.test(defaultBranchSha)) throw new Error('Invalid default-branch SHA');
  const { since, until } = activityWindow(now);
  const search = async (query) => {
    const result = await api(
      `search/issues?q=${encodeURIComponent(`repo:${REPOSITORY} ${query}`)}&per_page=1`,
    );
    if (result.incomplete_results !== false)
      throw new Error('Incomplete GitHub search; keeping last successful snapshot');
    return count(result.total_count, query);
  };
  const issues = await search('is:issue is:open');
  const pullRequests = await search('is:pr is:open');
  const closedPullRequests = await search(`is:pr is:closed closed:${since}..${until}`);
  const commits = count(
    Number(
      git([
        'rev-list',
        '--count',
        `--since-as-filter=${since}`,
        `--until=${until}`,
        defaultBranchSha,
        '--',
      ]),
    ),
    'commits',
  );
  const release = await api(`repos/${REPOSITORY}/releases/latest`);
  if (!/^v?\d+\.\d+\.\d+$/.test(release.tag_name)) throw new Error('Unexpected stable release tag');
  return {
    repository: REPOSITORY,
    updatedAt: until,
    defaultBranch: repo.default_branch,
    defaultBranchSha,
    stars: count(repo.stargazers_count, 'stars'),
    forks: count(repo.forks_count, 'forks'),
    issues,
    pullRequests,
    release: release.tag_name,
    activity: { since, until, closedPullRequests, commits },
  };
}

export function statusFiles(stats) {
  const files = {};
  for (const lang of ['zh', 'en']) {
    for (const theme of ['day', 'night'])
      files[`stats-${lang}-${theme}.svg`] = renderStatus(stats, lang, theme);
  }
  files['stats.json'] = JSON.stringify(stats, null, 2) + '\n';
  files['README.md'] = `${MARKER}
# DeepSeekBot repository status / 仓库状态

Last successful update / 最后成功更新: **${stats.updatedAt}**

| Metric / 指标 | Value / 数值 |
| --- | ---: |
| Stars | ${stats.stars} |
| Forks | ${stats.forks} |
| Open issues / 未关闭问题 | ${stats.issues} |
| Open PRs / 未关闭 PR | ${stats.pullRequests} |
| Closed PRs in 30 days / 30 天内关闭 PR | ${stats.activity.closedPullRequests} |
| Commits in 30 days / 30 天内提交 | ${stats.activity.commits} |
| Latest stable release / 最新稳定版本 | ${stats.release} |

Window / 统计窗口（UTC）: ${stats.activity.since} → ${stats.activity.until} (inclusive / 含边界).

Closed PRs include merged PRs, using GitHub's current closed state and closed_at date; issues are counted separately. Commits use committer dates across all history reachable from the default branch, including merge and bot commits. These are activity counts, not unique changes or a productivity measure. GitHub search can lag behind recent events.

关闭 PR 包含已合并 PR，按 GitHub 当前关闭状态及 closed_at 时间统计；Issues 单独计数。提交按默认分支所有可达历史的提交者时间统计，包含合并与机器人提交。这些是活动次数，不代表独立改动数或生产力；GitHub 搜索可能有延迟。

Default branch / 默认分支: [${stats.defaultBranch} at ${stats.defaultBranchSha}](https://github.com/${REPOSITORY}/commit/${stats.defaultBranchSha}).

Updated every six hours after the workflow is merged. Delayed or failed runs leave the last successful snapshot intact. GitHub image caching may delay visible updates. README prose and release highlights are maintained separately.

工作流合并后每六小时更新；任务延迟或失败时保留上次成功结果。GitHub 图片缓存可能使显示稍有延迟。README 正文和版本亮点单独维护。

[Machine-readable snapshot / JSON 数据](stats.json) · [Workflow / 工作流](https://github.com/${REPOSITORY}/actions/workflows/readme-status.yml)

Pixel lettering: Fusion Pixel, SIL Open Font License; see [license](Fusion-Pixel-OFL.txt). Renderer and source geometry live on the default branch under scripts/readme-art.mjs and docs/assets/readme/pixel/source/.
`;
  files['Fusion-Pixel-OFL.txt'] = readFileSync(
    new URL('../docs/assets/readme/pixel/source/Fusion-Pixel-OFL.txt', import.meta.url),
    'utf8',
  );
  return files;
}

export async function publishStatus(api, files, repository = REPOSITORY, branch = STATUS_BRANCH) {
  if (repository !== REPOSITORY || branch !== STATUS_BRANCH)
    throw new Error('Only the dedicated status branch can be published');
  if (
    Object.keys(files).sort().join() !== [...FILES].sort().join() ||
    !files['README.md'].startsWith(MARKER)
  )
    throw new Error('Invalid status file set');
  const base = `repos/${repository}/git`;
  let parent;
  try {
    parent = (await api(`${base}/ref/heads/${branch}`)).object.sha;
  } catch (error) {
    if (error.status !== 404) throw error;
  }
  let baseTree;
  if (parent) {
    const tree = await api(`${base}/trees/${parent}`);
    if (
      tree.truncated ||
      tree.tree.length !== FILES.length ||
      tree.tree.some((entry) => !FILES.includes(entry.path) || entry.type !== 'blob')
    )
      throw new Error('Unexpected status branch contents');
    const readme = tree.tree.find((entry) => entry.path === 'README.md');
    const blob = await api(`${base}/blobs/${readme.sha}`);
    if (!Buffer.from(blob.content, 'base64').toString('utf8').startsWith(MARKER))
      throw new Error('Status branch ownership marker missing');
    baseTree = tree.sha;
  }
  const tree = await api(`${base}/trees`, 'POST', {
    ...(baseTree ? { base_tree: baseTree } : {}),
    tree: FILES.map((path) => ({ path, mode: '100644', type: 'blob', content: files[path] })),
  });
  if (tree.sha === baseTree) return parent;
  const commit = await api(`${base}/commits`, 'POST', {
    message: `docs: refresh README repository status\n\nIssue: #2373`,
    tree: tree.sha,
    parents: parent ? [parent] : [],
  });
  if (parent) await api(`${base}/refs/heads/${branch}`, 'PATCH', { sha: commit.sha, force: false });
  else await api(`${base}/refs`, 'POST', { ref: `refs/heads/${branch}`, sha: commit.sha });
  return commit.sha;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const [command, directory] = process.argv.slice(2);
  if (!['collect', 'publish'].includes(command) || !directory)
    throw new Error('Usage: node scripts/readme-status.mjs collect|publish <output-directory>');
  const api = githubClient(process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN);
  if (command === 'collect') {
    const stats = await collectStatus({ api });
    const files = statusFiles(stats);
    mkdirSync(directory, { recursive: true });
    for (const [name, contents] of Object.entries(files))
      writeFileSync(join(directory, name), contents);
    console.log(`Collected ${stats.updatedAt} from ${stats.defaultBranchSha}`);
  } else {
    const files = Object.fromEntries(
      FILES.map((name) => [name, readFileSync(join(directory, name), 'utf8')]),
    );
    console.log(`Published ${await publishStatus(api, files)} to ${STATUS_BRANCH}`);
  }
}
