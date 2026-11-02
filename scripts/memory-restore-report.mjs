import { digest, markdownRow as formatRow } from './activity-idle-report.mjs';
export { digest };
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const behavior = 'desktop.memory.read-restore';
export const phases = ['before', 'history', 'after', 'refused'];
export const visualEvidence = phases.flatMap((phase) => [`${phase}.png`, `${phase}.aria.json`]);
export const requiredEvidence = [
  'identity.json',
  'created.json',
  'fixture.json',
  'initial.json',
  'saved-v1.json',
  'saved-v2.json',
  'v1.json',
  'before.json',
  'history.json',
  'restored.json',
  'after.json',
  'refusal.json',
  'refused.json',
  'graph.json',
  'checkpoints.json',
  'console.json',
  ...phases.flatMap((phase) => [`visible-${phase}.json`, `${phase}.diagnostics.json`]),
  ...visualEvidence,
];

export function memoryProblems(run, read) {
  const problems = [];
  const fixture = read('fixture');
  const sha = (value) => /^[a-f0-9]{40}$/u.test(value ?? '');
  const v1 = read('v1').file;
  const before = read('before').file;
  const after = read('after').file;
  const refused = read('refused').file;
  const restore = read('restored');
  const graph = read('graph');
  if (
    !fixture.taskCreated ||
    fixture.path !== 'AX-1975.md' ||
    fixture.v1 !== 'AX Memory version one.\n' ||
    fixture.v2 !== 'AX Memory version two.\n'
  )
    problems.push('Missing disposable Memory fixture');
  for (const [label, file, body] of [
    ['v1', v1, fixture.v1],
    ['before', before, fixture.v2],
    ['after', after, fixture.v1],
    ['refused', refused, fixture.v1],
  ]) {
    if (!file || file.path !== fixture.path || file.body !== body || !sha(file.head) || file.binary)
      problems.push(`${label}: incorrect Memory file/content/HEAD`);
  }
  if (
    !sha(read('initial').snapshot?.head) ||
    read('saved-v1').commit?.sha !== v1?.head ||
    read('saved-v2').commit?.sha !== before?.head ||
    v1?.head === before?.head
  )
    problems.push('Two distinct owner-saved versions missing');
  const history = read('history');
  if (
    history.sha !== v1?.head ||
    history.truncated ||
    !history.diff?.includes('+' + fixture.v1.trim()) ||
    !history.files?.some((file) => file.path === fixture.path && file.status === 'A')
  )
    problems.push('Historical version read missing or incomplete');
  const commit = graph.commits?.find((entry) => entry.sha === after?.head);
  if (
    restore.head !== after?.head ||
    restore.head === before?.head ||
    restore.head === v1?.head ||
    restore.backup !== null ||
    restore.saved?.head !== before?.head ||
    restore.saved?.botSlug !== run.botId ||
    graph.head !== after?.head ||
    graph.dirty !== false ||
    commit?.parents?.length !== 1 ||
    commit.parents[0] !== before?.head ||
    !commit.subject?.startsWith(`Restore Memory to ${v1?.head?.slice(0, 7)}:`)
  )
    problems.push('Restore did not create a clean descendant commit with the selected content');
  if (
    !read('checkpoints').checkpoints?.some(
      (entry) =>
        entry.id === restore.saved?.id &&
        entry.head === before?.head &&
        entry.botSlug === run.botId,
    )
  )
    problems.push('Pre-restore recovery checkpoint missing');
  const refusal = read('refusal');
  if (
    refusal.exitCode !== 1 ||
    refusal.value?.error?.code !== 'memory-conflict' ||
    refused?.head !== after?.head ||
    refused?.body !== after?.body
  )
    problems.push('Stale expected-head refusal did not preserve current content and HEAD');
  for (const phase of phases) {
    const visible = read(`visible-${phase}`);
    const body = phase === 'before' ? fixture.v2 : fixture.v1;
    if (
      visible.rendered !== true ||
      !visible.text?.includes(body.trim()) ||
      !read('created').dm?.channelId ||
      visible.selectedChannels?.length !== 1 ||
      visible.selectedChannels[0] !== read('created').dm.channelId ||
      (phase === 'history' && !visible.text?.includes(v1?.head?.slice(0, 7)))
    )
      problems.push(`${phase}: missing/incorrect visible Memory state`);
    const diagnostics = read(`${phase}.diagnostics`);
    if (
      diagnostics.host?.ok !== true ||
      diagnostics.client?.state !== 'shell-ready' ||
      diagnostics.page?.state !== 'shell-ready' ||
      diagnostics.page.firstFailure
    )
      problems.push(`${phase}: missing/failed Host or Client observation`);
  }
  const errors = read('console');
  if (!Array.isArray(errors) || errors.length)
    problems.push('Missing console observation or browser errors');
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
    const problems = memoryProblems(run, read);
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
    visualEvidence.some((name) => visual.evidence?.[name] !== run.evidence[name]) ||
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
    reason:
      'Two owner-saved Memory versions, historical read, descendant restore commit and stale expected-head refusal; Web and authority agree',
  };
}

export function markdownRow(row, prefix = '.') {
  return formatRow(row, prefix).replace(
    'This row does not qualify the complete Inbox.',
    'Only disposable Memory history/read/commit restore and stale-head guard are qualified; no remote push, credentials, branch switch or complete Self-Record qualification.',
  );
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
          evidence: Object.fromEntries(
            visualEvidence.map((name) => [name, digest(readFileSync(resolve(directory, name)))]),
          ),
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
