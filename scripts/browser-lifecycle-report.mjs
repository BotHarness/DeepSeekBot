import { digest, markdownRow as formatRow } from './activity-idle-report.mjs';
export { digest };
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function redactBrowserEvidence(text, instance, root) {
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

export const behavior = 'desktop.browser.open-observe-stop';
export const phases = ['off', 'running', 'stopped', 'disabled'];
export const visualEvidence = [
  'frame.jpg',
  ...phases.flatMap((phase) => [`${phase}.png`, `${phase}.aria.json`]),
];
export const requiredEvidence = [
  'identity.json',
  'created.json',
  'fixture.json',
  'off.json',
  'off-refusal.json',
  'opened.json',
  'running.json',
  'direct-tabs.json',
  'direct-read.json',
  'stopped.json',
  'stopped-refusal.json',
  'after-stopped-read.json',
  'disabled-refusal.json',
  'disabled.json',
  'bot-final.json',
  'lifecycle.json',
  'cleanup-browser.json',
  'cleanup-observation.json',
  'console.json',
  'http-errors.json',
  ...phases.flatMap((phase) => [`visible-${phase}.json`, `${phase}.diagnostics.json`]),
  ...visualEvidence,
];
export function browserProblems(run, read) {
  const problems = [];
  const fixture = read('fixture');
  if (
    !fixture.taskCreated ||
    fixture.marker !== 'AX Browser lifecycle 1976' ||
    fixture.title !== fixture.marker ||
    !/^http:\/\/127\.0\.0\.1:\d+\/$/.test(fixture.url ?? '')
  )
    problems.push('Missing deterministic loopback fixture');
  const running = read('running');
  const tab = running.tabs?.[0];
  if (
    running.ok !== true ||
    running.target !== 'local' ||
    running.running !== true ||
    running.tabs?.length !== 1 ||
    !tab?.targetId ||
    running.focused !== tab.targetId ||
    tab.url !== fixture.url ||
    tab.title !== fixture.title ||
    !(running.frame?.bytes > 0) ||
    running.takeover !== false ||
    running.cleanupRequired
  )
    problems.push('Running Browser identity/frame/target mismatch');
  const text = (value) =>
    value.content
      ?.filter((x) => x.type === 'text')
      .map((x) => x.text)
      .join('\n') ?? '';
  if (
    read('opened').ok !== true ||
    !text(read('opened')).includes(fixture.url) ||
    read('direct-read').ok !== true ||
    !text(read('direct-read')).includes(fixture.marker) ||
    !text(read('direct-read')).includes('37 blue boxes') ||
    !text(read('direct-read')).includes(fixture.url) ||
    read('direct-tabs').ok !== true ||
    !text(read('direct-tabs')).includes(tab?.targetId) ||
    !text(read('direct-tabs')).includes(fixture.url)
  )
    problems.push('Direct tool read does not correlate with observed tab');
  for (const phase of ['off', 'stopped', 'after-stopped-read', 'disabled', 'cleanup-observation']) {
    const value = read(phase);
    if (
      value.ok !== true ||
      value.target !== 'local' ||
      value.running !== false ||
      value.focused !== null ||
      value.tabs?.length !== 0 ||
      value.frame !== null ||
      value.cleanupRequired
    )
      problems.push(`${phase}: stale running/tab state or target change`);
  }
  for (const phase of ['off', 'disabled']) {
    const refusal = read(`${phase}-refusal`);
    if (
      refusal.exitCode !== 1 ||
      refusal.value?.error?.code !== 'host-refused' ||
      refusal.value.error.message !== 'Browser Access is off for this PersonaBot'
    )
      problems.push(`${phase}: Access refusal missing or confused with startup failure`);
  }
  const refusal = read('stopped-refusal');
  if (
    refusal.exitCode !== 1 ||
    refusal.value?.error?.code !== 'host-refused' ||
    !refusal.value.error.message.includes('has no Bot Browser tab yet')
  )
    problems.push('Stopped read refusal missing');
  if (read('cleanup-browser').ok !== true) problems.push('Browser cleanup failed');
  if (
    read('bot-final').bot?.slug !== run.botId ||
    (read('bot-final').bot.browserAccess !== undefined &&
      read('bot-final').bot.browserAccess !== false)
  )
    problems.push('Browser Access silently re-enabled or wrong Bot');
  const logs = JSON.stringify(read('lifecycle'));
  if (
    !logs.includes('stop requested (panel)') ||
    !logs.includes(run.botId) ||
    !logs.includes('direct tool')
  )
    problems.push('Lifecycle diagnostics missing');
  for (const phase of phases) {
    const visible = read(`visible-${phase}`);
    if (
      visible.rendered !== true ||
      visible.fullscreen !== false ||
      visible.selectedChannels?.length !== 1 ||
      !read('created').dm?.channelId ||
      visible.selectedChannels[0] !== read('created').dm.channelId ||
      visible.accessLabel !==
        (['off', 'disabled'].includes(phase)
          ? 'Enable Browser Access'
          : 'Disable Browser Access') ||
      !visible.text?.includes(
        phase === 'running'
          ? fixture.title
          : phase === 'stopped'
            ? 'Stopped'
            : "This PersonaBot's sessions may use the browser",
      )
    )
      problems.push(`${phase}: missing/incorrect visible Browser state`);
    if (
      phase === 'running' &&
      (!visible.text.includes(fixture.url) ||
        !visible.viewers?.some((v) => v.visible && v.live === true && v.status === ''))
    )
      problems.push('Running panel viewer or fixture URL missing');
    const d = read(`${phase}.diagnostics`);
    if (
      d.host?.ok !== true ||
      d.client?.state !== 'shell-ready' ||
      d.page?.state !== 'shell-ready' ||
      d.page.firstFailure
    )
      problems.push(`${phase}: missing/failed Host or Client observation`);
  }
  if (!Array.isArray(read('console')) || read('console').length)
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
    const problems = browserProblems(run, read);
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
      'One default Browser fixture tab, correlated Web and direct tool reads, stopped state and Access refusal; no other targets qualified',
  };
}

export function markdownRow(row, prefix = '.') {
  return formatRow(row, prefix).replace(
    'This row does not qualify the complete Inbox.',
    'Only default local Browser open/observe/stop and Access refusal are qualified; multi-tab, upload, profile reset, takeover, model and other Computer targets remain gaps.',
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
