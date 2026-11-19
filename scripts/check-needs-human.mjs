import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { classify } from './ci-plan.mjs';

const LABEL = 'needs-human';
const MARKER = '<!-- botharness:pr-needs-human -->';
const SOURCE = 'https://github.com/BotHarness/DeepSeekBot/issues/4296#issuecomment-6915324149';
const WRITERS = new Set(['admin', 'maintain', 'write']);
const PAGE_SIZE = 100;
const MAX_FILES = 3000;

export function planNeedsHuman({ permission, fork, labels, changes, incomplete }) {
  const reasons = [];
  if (fork) reasons.push({ rule: 'Head repository is a fork', paths: [] });
  if (!WRITERS.has(permission))
    reasons.push({ rule: 'Author lacks write access to this repository', paths: [] });
  if (incomplete) reasons.push({ rule: 'GitHub did not provide the complete diff', paths: [] });

  const areas = new Map();
  const paths = new Set(
    changes.flatMap(({ filename, previous_filename }) =>
      previous_filename ? [filename, previous_filename] : [filename],
    ),
  );
  for (const path of [...paths].sort()) {
    const area = classify(path)?.oneWayDoor;
    if (!area) continue;
    if (!areas.has(area)) areas.set(area, []);
    areas.get(area).push(path);
  }
  for (const [rule, paths] of areas) reasons.push({ rule, paths });
  return { action: labels.includes(LABEL) ? 'keep' : reasons.length ? 'add' : 'none', reasons };
}

function formatPaths(paths) {
  const lines = [];
  let length = 0;
  for (const path of paths) {
    const escaped = JSON.stringify(path).slice(1, -1);
    const runs = escaped.match(/`+/g) ?? [];
    const delimiter = '`'.repeat(1 + Math.max(0, ...runs.map((run) => run.length)));
    const line = `  - ${delimiter} ${escaped} ${delimiter}`;
    length += Buffer.byteLength(line) + 1;
    if (length > 9_000) break;
    lines.push(line);
  }
  if (lines.length < paths.length)
    lines.push(`  - ${paths.length - lines.length} more matching paths`);
  return lines;
}

function commentBody(reasons) {
  const details = reasons.length
    ? reasons.flatMap(({ rule, paths }) => [`- ${rule}`, ...formatPaths(paths)])
    : [
        'The current diff and author have no active TB11 trigger. The existing label stays in place for a maintainer.',
      ];
  return [
    MARKER,
    '**Human merge required** (`needs-human`)',
    '',
    ...details,
    '',
    `[Merge policy](${SOURCE})`,
  ].join('\n');
}

async function github(path, method = 'GET', body) {
  const response = await fetch(`${process.env.GITHUB_API_URL}${path}`, {
    method,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      'content-type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok)
    throw Object.assign(new Error(`${method} ${path}: ${response.status}`), {
      status: response.status,
    });
  return response.json();
}

async function authorPermission(repo, pr) {
  try {
    const result = await github(
      `${repo}/collaborators/${encodeURIComponent(pr.user.login)}/permission`,
    );
    return result.permission;
  } catch (error) {
    if (error.status === 404) return 'none';
    throw error;
  }
}

async function changedFiles(pull, count) {
  const changes = [];
  for (let page = 1; changes.length < Math.min(count, MAX_FILES); page++) {
    const batch = await github(`${pull}/files?per_page=${PAGE_SIZE}&page=${page}`);
    changes.push(
      ...batch.map(({ filename, previous_filename }) => ({ filename, previous_filename })),
    );
    if (batch.length < PAGE_SIZE) break;
  }
  return changes;
}

async function ensureLabel(repo) {
  const path = `${repo}/labels/${LABEL}`;
  try {
    await github(path);
  } catch (error) {
    if (error.status !== 404) throw error;
    try {
      await github(`${repo}/labels`, 'POST', {
        name: LABEL,
        color: 'B60205',
        description: 'A human maintainer must decide whether to merge this PR',
      });
    } catch (createError) {
      if (createError.status !== 422) throw createError;
      await github(path);
    }
  }
}

async function updateComment(repo, issue, body) {
  for (let page = 1; ; page++) {
    const comments = await github(`${issue}/comments?per_page=${PAGE_SIZE}&page=${page}`);
    const sticky = comments.find(
      (comment) =>
        comment.user?.login === 'github-actions[bot]' && comment.body?.startsWith(MARKER),
    );
    if (sticky) {
      if (sticky.body !== body)
        await github(`${repo}/issues/comments/${sticky.id}`, 'PATCH', { body });
      return;
    }
    if (comments.length < PAGE_SIZE) break;
  }
  await github(`${issue}/comments`, 'POST', { body });
}

async function readStablePull(repo, pull) {
  let pr = await github(pull);
  for (let attempt = 0; attempt < 2; attempt++) {
    if (pr.state !== 'open') return null;
    const [changes, permission] = await Promise.all([
      changedFiles(pull, pr.changed_files),
      authorPermission(repo, pr),
    ]);
    const current = await github(pull);
    if (current.state !== 'open') return null;
    if (
      current.head.sha === pr.head.sha &&
      current.base.sha === pr.base.sha &&
      current.changed_files === pr.changed_files
    )
      return { pr: current, changes, permission };
    pr = current;
  }
  throw new Error('PR diff changed during inspection. Run again against the current PR.');
}

async function main() {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const repo = `/repos/${event.repository.full_name}`;
  const number = event.pull_request.number;
  const pull = `${repo}/pulls/${number}`;
  const issue = `${repo}/issues/${number}`;
  const snapshot = await readStablePull(repo, pull);
  if (!snapshot) return;
  const { pr, changes, permission } = snapshot;
  const { action, reasons } = planNeedsHuman({
    permission,
    fork: pr.head.repo?.id !== pr.base.repo.id,
    labels: pr.labels.map(({ name }) => name),
    changes,
    incomplete: changes.length !== pr.changed_files,
  });
  if (action === 'add') {
    await ensureLabel(repo);
    await github(`${issue}/labels`, 'POST', { labels: [LABEL] });
  }
  if (action !== 'none') await updateComment(repo, issue, commentBody(reasons));
  console.log(
    `needs-human: ${action} (association ${pr.author_association}, permission ${permission})`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    await main();
  } catch (error) {
    console.error(`needs-human: ${error.message}`);
    process.exitCode = 1;
  }
}
