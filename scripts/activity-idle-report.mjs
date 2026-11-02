import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const behavior = 'desktop.activity-center.idle-personabot';
export const requiredEvidence = [
  'identity.json',
  'created.json',
  'before.json',
  'after.json',
  'visible.json',
  'activity.png',
  'aria.json',
  'diagnostics.json',
  'console.json',
];
export const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

const hasAttention = (value) => Object.values(value ?? {}).some((count) => count !== 0);

export function idleProblems({ botId, before, after, visible, diagnostics, console: errors }) {
  const problems = [];
  for (const [phase, value] of [
    ['before', before],
    ['after', after],
  ]) {
    const bot = value?.activity?.bot;
    const overview = value?.overview?.bots?.find((item) => item.slug === botId);
    if (
      !botId ||
      bot?.slug !== botId ||
      bot.state !== 'idle' ||
      (bot.sessions?.length ?? 0) !== 0 ||
      (bot.sessionCount ?? 0) !== 0 ||
      bot.activity ||
      hasAttention(bot.attention)
    )
      problems.push(`${phase}: activity is not the same idle PersonaBot`);
    if (
      !Array.isArray(value?.attention?.items) ||
      value.attention.items.length !== 0 ||
      value.attention.nextCursor
    )
      problems.push(`${phase}: attention is not empty`);
    if (
      !overview ||
      overview.state !== 'idle' ||
      overview.paused ||
      overview.hasAction ||
      overview.sessions?.length !== 0 ||
      overview.activity ||
      hasAttention(overview.attention)
    )
      problems.push(`${phase}: overview contains work or is missing`);
  }
  if (
    visible?.botId !== botId ||
    visible?.state !== 'Idle' ||
    visible?.name !== after?.overview?.bots?.find((b) => b.slug === botId)?.displayName ||
    visible?.hasActions !== false ||
    visible?.sessions !== 0 ||
    visible?.rendered !== true
  )
    problems.push('visible: missing or inconsistent idle Bot card');
  if (
    diagnostics?.host?.ok !== true ||
    diagnostics?.client?.state !== 'shell-ready' ||
    diagnostics?.page?.state !== 'shell-ready' ||
    diagnostics?.page?.firstFailure
  )
    problems.push('diagnostics: Host or Client observation unavailable/failed');
  if (!Array.isArray(errors) || errors.length !== 0)
    problems.push('console: errors or missing observation');
  return problems;
}

export function coverageRow(directory, commit, dirty = false) {
  const row = {
    behavior,
    platform: 'desktop Web + CLI',
    status: 'not-run',
    commit,
    reason: 'No run selected',
    evidence: [],
    humanQA: 'not-run',
    model: 'not-run',
    native: 'not-run',
    im: 'not-run',
  };
  if (!directory) return row;
  let run;
  try {
    run = JSON.parse(readFileSync(resolve(directory, 'run.json'), 'utf8'));
  } catch {
    return { ...row, status: 'needs-revalidation', reason: 'Missing or invalid run record' };
  }
  Object.assign(row, {
    recordedStatus: run.status,
    recordedCommit: run.commit,
    observedAt: run.finishedAt,
    environment: run.environment,
    expected: run.expected,
    actual: run.actual,
    botId: run.botId,
    evidence: Object.keys(run.evidence ?? {}),
  });
  if (run.behavior !== behavior || run.commit !== commit || run.dirty || dirty)
    return {
      ...row,
      status: 'needs-revalidation',
      reason: 'Behavior/commit mismatch or uncommitted source',
    };
  if (['fail', 'blocked'].includes(run.status))
    return { ...row, status: run.status, reason: run.reason };
  if (run.status !== 'pass')
    return { ...row, status: 'needs-revalidation', reason: 'Run did not finish' };
  if (
    run.version !== 1 ||
    !/^[a-f0-9]{40}$/u.test(run.base ?? '') ||
    !Number.isFinite(Date.parse(run.startedAt)) ||
    !Number.isFinite(Date.parse(run.finishedAt)) ||
    !run.expected ||
    !run.actual ||
    !run.botId ||
    !Array.isArray(run.actions) ||
    run.actions.length === 0 ||
    !['platform', 'arch', 'node', 'viewport', 'locale', 'theme', 'dsh', 'browser'].every(
      (key) => typeof run.environment?.[key] === 'string' && run.environment[key].length > 0,
    )
  )
    return { ...row, status: 'needs-revalidation', reason: 'Incomplete run metadata' };
  for (const name of requiredEvidence) {
    const path = resolve(directory, name);
    if (!existsSync(path) || digest(readFileSync(path)) !== run.evidence?.[name])
      return {
        ...row,
        status: 'needs-revalidation',
        reason: `Missing or changed evidence: ${name}`,
      };
  }
  try {
    const read = (name) => JSON.parse(readFileSync(resolve(directory, `${name}.json`), 'utf8'));
    const identity = read('identity').identity;
    if (
      identity?.kind !== 'development' ||
      identity.source?.revision !== run.commit ||
      identity.source.dirty ||
      read('created').bot?.id !== run.botId
    )
      return {
        ...row,
        status: 'needs-revalidation',
        reason: 'Host build or created identity does not match this run',
      };
    const problems = idleProblems({
      botId: run.botId,
      before: read('before'),
      after: read('after'),
      visible: read('visible'),
      diagnostics: read('diagnostics'),
      console: read('console'),
    });
    if (problems.length)
      return { ...row, status: 'needs-revalidation', reason: problems.join('; ') };
  } catch {
    return { ...row, status: 'needs-revalidation', reason: 'Unreadable required evidence' };
  }
  let visual;
  try {
    visual = JSON.parse(readFileSync(resolve(directory, 'visual-review.json'), 'utf8'));
  } catch {
    return {
      ...row,
      status: 'needs-revalidation',
      reason: 'Screenshot/ARIA visual review pending',
    };
  }
  if (
    visual.commit !== commit ||
    visual.screenshot !== run.evidence['activity.png'] ||
    visual.aria !== run.evidence['aria.json'] ||
    !visual.reviewer ||
    !visual.note ||
    !Number.isFinite(Date.parse(visual.reviewedAt))
  )
    return {
      ...row,
      status: 'needs-revalidation',
      reason: 'Visual review does not apply to this evidence',
    };
  if (visual.decision !== 'pass')
    return { ...row, status: 'fail', reason: `Visual inspection: ${visual.note}` };
  row.evidence.push('visual-review.json');
  return {
    ...row,
    status: 'pass',
    reason: 'Same idle PersonaBot observed through Web and CLI; no activity is normal',
  };
}

export function markdownRow(row, prefix = '.') {
  const safe = (value) =>
    String(value ?? '')
      .replaceAll('|', '\\|')
      .replaceAll('\n', ' ');
  return [
    '| Behavior | Platform | Status | Commit | Expected / actual | Evidence | Human QA |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    `| ${row.behavior} | ${row.platform} | ${row.status} | ${row.commit} | ${safe(row.expected)} / ${safe(row.actual ?? row.reason)} | ${row.evidence.map((f) => `[${f}](${prefix}/${f})`).join(', ')} | ${row.humanQA} |`,
    '',
    `Reason: ${row.reason}`,
    '',
    'Model, native-device and IM checks: not run. This row does not qualify the complete Inbox.',
  ].join('\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const at = args.indexOf('--commit');
  const directory = args[0]?.startsWith('--') ? undefined : args[0];
  const git = (...values) => execFileSync('git', values, { encoding: 'utf8' }).trim();
  const commit = at < 0 ? git('rev-parse', 'HEAD') : args[at + 1];
  const reviewAt = args.indexOf('--visual-review');
  if (reviewAt >= 0) {
    const decision = args[reviewAt + 1];
    const reviewer = args[args.indexOf('--reviewer') + 1];
    const note = args[args.indexOf('--note') + 1];
    if (
      !directory ||
      !['pass', 'fail'].includes(decision) ||
      !args.includes('--reviewer') ||
      !args.includes('--note') ||
      !reviewer ||
      !note
    )
      throw new Error(
        'Visual review needs a directory, pass|fail, --reviewer and --note after inspecting screenshot and ARIA',
      );
    const run = JSON.parse(readFileSync(resolve(directory, 'run.json'), 'utf8'));
    writeFileSync(
      resolve(directory, 'visual-review.json'),
      JSON.stringify(
        {
          commit: run.commit,
          decision,
          reviewer,
          note,
          reviewedAt: new Date().toISOString(),
          screenshot: digest(readFileSync(resolve(directory, 'activity.png'))),
          aria: digest(readFileSync(resolve(directory, 'aria.json'))),
        },
        null,
        2,
      ),
      { flag: 'wx', mode: 0o600 },
    );
  }
  const row = coverageRow(directory, commit, at < 0 && git('status', '--porcelain').length > 0);
  console.log(
    args.includes('--json')
      ? JSON.stringify(row, null, 2)
      : markdownRow(row, directory ? basename(directory) : '.'),
  );
  process.exitCode = row.status === 'pass' || row.status === 'not-run' ? 0 : 1;
}
