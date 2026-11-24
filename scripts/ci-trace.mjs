import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const REPOSITORY = 'BotHarness/DeepSeekBot';
const WORKFLOW = 'verify.yml';
const MIN_STEP_SECONDS = 5;
const TOP_FILES = 10;
const SHARD_JOB = /^test \((?:affected )?shard \d+\)$/;
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m|\\^\\[\\[[0-9;]*m`, 'gu');
const RESULT =
  /^(\S+)\s+[✓×↓]\s+\S+\s+(\S+\.test\.[cm]?[jt]sx?) \(\d+ tests?[^)]*\)(?: (\d+)ms)?$/u;
const SUMMARY = /Duration\s+([\d.]+)s \(([^)]*)\)/u;

const seconds = (from, to) => (Date.parse(to) - Date.parse(from)) / 1000;
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
};
const jobKey = (name) => name.replace(/shard \d+/u, 'shard N');

export function summarizeRuns(runs) {
  const jobs = new Map();
  const walls = [];
  const lastJobs = new Map();
  for (const run of runs) {
    const done = run.jobs.filter(
      (job) => job.conclusion === 'success' && job.started_at && job.completed_at,
    );
    if (!done.length) continue;
    const start = Math.min(...done.map((job) => Date.parse(job.created_at ?? job.started_at)));
    const end = Math.max(...done.map((job) => Date.parse(job.completed_at)));
    walls.push((end - start) / 1000);
    const last = done.find((job) => Date.parse(job.completed_at) === end);
    lastJobs.set(jobKey(last.name), (lastJobs.get(jobKey(last.name)) ?? 0) + 1);
    for (const job of done) {
      const key = jobKey(job.name);
      if (!jobs.has(key)) jobs.set(key, { total: [], queue: [], slack: [], steps: new Map() });
      const entry = jobs.get(key);
      entry.total.push(seconds(job.started_at, job.completed_at));
      entry.queue.push(seconds(job.created_at ?? job.started_at, job.started_at));
      entry.slack.push((end - Date.parse(job.completed_at)) / 1000);
      for (const step of job.steps ?? []) {
        if (!step.started_at || !step.completed_at) continue;
        const duration = seconds(step.started_at, step.completed_at);
        if (!entry.steps.has(step.name)) entry.steps.set(step.name, []);
        entry.steps.get(step.name).push(duration);
      }
    }
  }
  return {
    runs: walls.length,
    wall: { median: median(walls), max: Math.max(0, ...walls) },
    lastJobs: Object.fromEntries([...lastJobs].sort((a, b) => b[1] - a[1])),
    jobs: [...jobs]
      .map(([name, entry]) => ({
        name,
        median: median(entry.total),
        max: Math.max(...entry.total),
        queue: median(entry.queue),
        slack: median(entry.slack),
        steps: [...entry.steps]
          .map(([step, values]) => ({
            name: step,
            median: median(values),
            max: Math.max(...values),
          }))
          .filter((step) => step.median >= MIN_STEP_SECONDS)
          .sort((a, b) => b.median - a.median),
      }))
      .sort((a, b) => b.median - a.median),
  };
}

export function parseShardLog(text) {
  const files = [];
  let start;
  let summary;
  for (const raw of text.replace(ANSI, '').split('\n')) {
    const line = raw.slice(raw.lastIndexOf('\t') + 1);
    const result = RESULT.exec(line);
    if (result) {
      const at = Date.parse(result[1]);
      const ms = Number(result[3] ?? 0);
      if (start === undefined || at - ms < start) start = at - ms;
      files.push({ file: result[2], ms, end: at });
      continue;
    }
    const match = SUMMARY.exec(line);
    if (match)
      summary = {
        duration: Number(match[1]),
        phases: Object.fromEntries(
          match[2].split(', ').map((part) => {
            const [name, share] = part.split(' ');
            return [name, Number(share.replace('%', ''))];
          }),
        ),
      };
  }
  const testSeconds = files.reduce((sum, file) => sum + file.ms, 0) / 1000;
  const wall = files.length ? (Math.max(...files.map((file) => file.end)) - start) / 1000 : 0;
  return {
    files: files.length,
    testSeconds,
    wall,
    parallelism: wall ? testSeconds / wall : 0,
    summary,
    slowest: [...files].sort((a, b) => b.ms - a.ms).slice(0, TOP_FILES),
    lastFinished: [...files].sort((a, b) => b.end - a.end).slice(0, 3),
  };
}

const minutes = (value) => `${(value / 60).toFixed(1)} min`;

export function formatReport(summary, shards = []) {
  const lines = [
    `# Verify trace: ${summary.runs} runs`,
    '',
    `Wall time: median ${minutes(summary.wall.median)}, max ${minutes(summary.wall.max)}.`,
    `Job that finished last: ${Object.entries(summary.lastJobs)
      .map(([name, count]) => `${name} (${count})`)
      .join(', ')}.`,
    '',
    '| Job | Median | Max | Queue | Slack to run end |',
    '| --- | --- | --- | --- | --- |',
    ...summary.jobs.map(
      (job) =>
        `| ${job.name} | ${minutes(job.median)} | ${minutes(job.max)} | ${job.queue.toFixed(0)} s | ${minutes(job.slack)} |`,
    ),
  ];
  for (const job of summary.jobs.slice(0, 4)) {
    lines.push('', `## ${job.name}`, '', '| Step | Median | Max |', '| --- | --- | --- |');
    for (const step of job.steps.slice(0, 6))
      lines.push(
        `| ${step.name.replaceAll('|', '\\|').slice(0, 90)} | ${step.median.toFixed(0)} s | ${step.max.toFixed(0)} s |`,
      );
  }
  if (shards.length) {
    lines.push(
      '',
      '## Test shards',
      '',
      '| Shard | Files | Test time | Shard wall | Parallelism | Phases |',
      '| --- | --- | --- | --- | --- | --- |',
    );
    for (const shard of shards)
      lines.push(
        `| ${shard.name} | ${shard.files} | ${shard.testSeconds.toFixed(0)} s | ${shard.wall.toFixed(0)} s | ${shard.parallelism.toFixed(1)} | ${Object.entries(
          shard.summary?.phases ?? {},
        )
          .map(([name, share]) => `${name} ${share}%`)
          .join(', ')} |`,
      );
    for (const shard of shards) {
      lines.push('', `### ${shard.name}: slowest files`, '');
      for (const file of shard.slowest)
        lines.push(`- ${(file.ms / 1000).toFixed(1)} s ${file.file}`);
      lines.push(
        `- last to finish: ${shard.lastFinished.map((file) => `${file.file} (${(file.ms / 1000).toFixed(1)} s)`).join(', ')}`,
      );
    }
  }
  return `${lines.join('\n')}\n`;
}

function gh(args) {
  return execFileSync('gh', args, {
    encoding: 'utf8',
    maxBuffer: 1 << 28,
    shell: false,
    windowsHide: true,
  });
}

function option(args, name, fallback) {
  const at = args.indexOf(name);
  return at < 0 ? fallback : args[at + 1];
}

function main(args) {
  const repository = option(args, '--repo', REPOSITORY);
  const explicit = args.flatMap((arg, at) => (args[at - 1] === '--run' ? [arg] : []));
  const ids = explicit.length
    ? explicit
    : JSON.parse(
        gh([
          'run',
          'list',
          '-R',
          repository,
          '--workflow',
          WORKFLOW,
          '--branch',
          option(args, '--branch', 'main'),
          '--event',
          option(args, '--event', 'push'),
          '--status',
          'success',
          '--limit',
          option(args, '--runs', '10'),
          '--json',
          'databaseId',
        ]),
      ).map((run) => String(run.databaseId));
  const runs = ids.map((id) =>
    JSON.parse(gh(['api', `repos/${repository}/actions/runs/${id}/jobs?per_page=100`])),
  );
  const shards = [];
  if (args.includes('--logs') && runs.length)
    for (const job of runs[0].jobs.filter((job) => SHARD_JOB.test(job.name)))
      shards.push({
        name: job.name,
        ...parseShardLog(gh(['run', 'view', '--job', String(job.id), '-R', repository, '--log'])),
      });
  process.stdout.write(formatReport(summarizeRuns(runs), shards));
}

if (
  process.argv[1] &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
)
  main(process.argv.slice(2));
