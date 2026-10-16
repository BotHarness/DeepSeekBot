import { digest, markdownRow as formatRow } from './activity-idle-report.mjs';
export { digest };
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function redactComputerEvidence(text, instance, root) {
  let value = String(text);
  if (instance?.url) {
    value = value.replaceAll(instance.url, '[redacted]');
    const origin = new URL(instance.url).origin;
    value = value.replaceAll(origin, (match, offset, whole) =>
      /\d/u.test(whole[offset + match.length] ?? '') ? match : '[redacted]',
    );
  }
  for (const secret of [
    instance?.home,
    root,
    instance?.url && new URL(instance.url).searchParams.get('token'),
  ].filter(Boolean))
    value = value.replaceAll(secret, '[redacted]');
  return value;
}

export const behavior = 'desktop.computer.container-start-frame-stop';
export const phases = ['off', 'authorized', 'running', 'stopped'];
export const visualEvidence = [
  'frame.jpg',
  ...phases.flatMap((p) => [`${p}.png`, `${p}.aria.json`]),
];
export const requiredEvidence = [
  'identity.json',
  'created.json',
  'ownership.json',
  'docker-version.json',
  'fixture.json',
  'initial.json',
  'running.json',
  'frame.json',
  'container-running.json',
  'stopped.json',
  'stopped-refusal.json',
  'after-stopped-read.json',
  'container-stopped.json',
  'lifecycle.json',
  'computer-diagnostics.json',
  'cleanup-computer.json',
  'cleanup-observation.json',
  'console.json',
  'http-errors.json',
  ...phases.flatMap((p) => [`visible-${p}.json`, `${p}.diagnostics.json`]),
  ...visualEvidence,
];
export function computerProblems(run, read) {
  const problems = [];
  const ownership = read('ownership');
  const container = read('container-running');
  if (
    !/^botharness-ax1977-[a-z0-9-]+$/u.test(ownership.container ?? '') ||
    ownership.volume !== `${ownership.container}-config` ||
    ownership.taskCreated !== true ||
    !ownership.initialContainerAbsent ||
    !ownership.initialVolumeAbsent
  )
    problems.push('Task resource ownership is missing');
  if (!read('docker-version').Server?.Version) problems.push('Docker Engine is not qualified');
  for (const phase of [
    'initial',
    'running',
    'stopped',
    'after-stopped-read',
    'cleanup-observation',
  ]) {
    const value = read(phase);
    if (
      value.target !== 'container' ||
      value.provider !== 'docker' ||
      value.probe?.available !== true ||
      value.status?.storage?.kind !== 'volume' ||
      value.status.storage.target !== ownership.volume ||
      value.status.state !==
        (phase === 'initial' ? 'absent' : phase === 'running' ? 'running' : 'stopped')
    )
      problems.push(`${phase}: target, ownership or lifecycle state mismatch`);
  }
  if (
    !container.id ||
    container.name !== `/${ownership.container}` ||
    container.running !== true ||
    !container.mounts?.some((m) => m.name === ownership.volume && m.destination === '/config') ||
    read('container-stopped').id !== container.id ||
    read('container-stopped').running !== false
  )
    problems.push('Docker instance or persistent volume correlation failed');
  if (
    read('fixture').containerId !== container.id ||
    read('fixture').marker !== `AX Container Computer 1977 — ${ownership.container}`
  )
    problems.push('Test picture does not belong to this container');
  const frame = read('frame');
  if (
    frame.target !== 'container' ||
    !(frame.bytes > 0) ||
    !Number.isSafeInteger(frame.seq) ||
    frame.seq < 1 ||
    !['image/jpeg', 'image/png'].includes(frame.mimeType)
  )
    problems.push('No real Container Computer frame');
  const refusal = read('stopped-refusal');
  if (refusal.exitCode !== 1 || refusal.value?.error?.code !== 'not-running')
    problems.push('Stopped frame must refuse without restarting');
  if (read('cleanup-computer').ok !== true) problems.push('Computer cleanup failed');
  const logs = JSON.stringify(read('lifecycle'));
  if (!logs.includes('start requested (panel)') || !logs.includes('stop requested (panel)'))
    problems.push('Lifecycle logs do not contain the panel start and stop');
  if (!JSON.stringify(read('computer-diagnostics')).includes('lifecycle'))
    problems.push('Computer diagnostic transitions missing');
  for (const phase of phases) {
    const v = read(`visible-${phase}`);
    if (
      !v.rendered ||
      v.selectedChannels?.length !== 1 ||
      v.selectedChannels[0] !== read('created').dm?.channelId ||
      v.accessLabel !== (phase === 'off' ? 'Enable Computer Access' : 'Disable Computer Access')
    )
      problems.push(`${phase}: selected Bot or visible Access does not match`);
    if (phase !== 'off' && !v.text?.includes('Docker Computer'))
      problems.push(`${phase}: wrong target UI`);
    if (phase === 'authorized' && !v.text?.includes('Authorize and start'))
      problems.push('Explicit start confirmation missing');
    if (phase === 'stopped' && !v.text?.includes('Stopped')) problems.push('Stopped panel missing');
    if (
      phase === 'running' &&
      (!v.text?.includes('Running') ||
        !v.live ||
        !v.viewers?.some((x) => x.visible && x.src?.includes('/botharness-computer/viewer/')))
    )
      problems.push('Actual live Container viewer missing');
    const d = read(`${phase}.diagnostics`);
    if (
      d.host?.ok !== true ||
      d.client?.state !== 'shell-ready' ||
      d.page?.state !== 'shell-ready' ||
      d.page.firstFailure
    )
      problems.push(`${phase}: Host/Client evidence missing or failed`);
  }
  if (!Array.isArray(read('console')) || read('console').length)
    problems.push('Client console errors or missing observation');
  if (!Array.isArray(read('http-errors')) || read('http-errors').length)
    problems.push('HTTP failures or missing observation');
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
    const problems = computerProblems(run, read);
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
      'One task-owned Container Computer, real panel and CLI frame, correlated state and diagnostics, explicit stop and subsequent frame refusal',
  };
}

export function markdownRow(row, prefix = '.') {
  return formatRow(row, prefix).replace(
    'This row does not qualify the complete Inbox.',
    'Only Container Computer start, frame and stop are qualified; Local Computer, input, import/export, phone WebRTC and model behavior remain outside this row.',
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
