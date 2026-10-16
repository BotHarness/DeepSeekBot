import { digest, markdownRow as formatRow } from './activity-idle-report.mjs';
export { digest };
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const behavior = 'desktop.grants.temporary-read-revoke';
export const visualEvidence = ['before', 'granted', 'after'].flatMap((phase) => [
  `${phase}.png`,
  `${phase}.aria.json`,
]);
export const requiredEvidence = [
  'identity.json',
  'created.json',
  'fixture.json',
  'before.json',
  'read-before.json',
  'granted.json',
  'read-granted.json',
  'unconfirmed-revoke.json',
  'after-unconfirmed.json',
  'revoked.json',
  'after.json',
  'read-after.json',
  'visible-before.json',
  'visible-granted.json',
  'visible-after.json',
  'before.diagnostics.json',
  'granted.diagnostics.json',
  'after.diagnostics.json',
  'console.json',
  'trace.json',
  'cleanup.json',
  ...visualEvidence,
];

export function grantProblems(run, read) {
  const problems = [];
  const fixture = read('fixture');
  if (
    !fixture.taskCreated ||
    !fixture.isolatedFromHost ||
    !fixture.notUserAncestor ||
    fixture.files?.length !== 1 ||
    fixture.files[0] !== 'README.md' ||
    typeof fixture.sample !== 'string' ||
    fixture.bytes !== Buffer.byteLength(fixture.sample) ||
    fixture.sha256 !== digest(fixture.sample)
  )
    problems.push('Unsafe or incomplete temporary fixture');
  const grants = (name) => read(name).grants;
  const same = (grant) =>
    grant.id === run.grantId &&
    grant.botSlug === run.botId &&
    grant.workspaceId === run.workspaceId &&
    grant.workspacePath === fixture.path;
  if (!run.botId || !run.grantId || !run.workspaceId)
    problems.push('Missing Bot/Workspace/Grant identity');
  if (!Array.isArray(grants('before')) || grants('before').length !== 0)
    problems.push('PersonaBot already had Grants');
  for (const phase of ['granted', 'after-unconfirmed']) {
    const rows = grants(phase);
    if (!Array.isArray(rows) || rows.length !== 1 || !same(rows[0]) || rows[0].revokedAt)
      problems.push(`${phase}: expected same active Grant`);
  }
  const revoked = read('revoked').grant;
  const after = grants('after');
  if (
    !revoked ||
    !same(revoked) ||
    !Number.isFinite(Date.parse(revoked.revokedAt)) ||
    !Array.isArray(after) ||
    after.length !== 1 ||
    !same(after[0]) ||
    after[0].revokedAt !== revoked.revokedAt
  )
    problems.push('Revocation not authoritative for same Grant');
  for (const phase of ['read-before', 'read-after']) {
    const result = read(phase);
    if (
      result.exitCode !== 1 ||
      result.value?.error?.code !== 'tool-failed' ||
      !result.value.error.message.includes('outside current authorized directories')
    )
      problems.push(
        `${phase}: expected authorization refusal, not transport/tool availability failure`,
      );
  }
  const successful = read('read-granted');
  const value = successful.value;
  if (
    successful.exitCode !== 0 ||
    value?.slug !== run.botId ||
    value.tool !== 'channel_attachment_import' ||
    value.sessionId !== 'direct' ||
    !/^file:[0-9a-f-]{36}$/u.test(value.result?.fileId ?? '') ||
    value.result.name !== 'README.md' ||
    value.result.size !== fixture.bytes
  )
    problems.push(
      'Granted direct file read/import did not return the expected independent sample reference',
    );
  const unconfirmed = read('unconfirmed-revoke');
  if (
    unconfirmed.exitCode !== 2 ||
    unconfirmed.value?.error?.code !== 'usage' ||
    !unconfirmed.value.error.message.includes('--confirm')
  )
    problems.push('Missing explicit revocation confirmation guard');
  for (const phase of ['before', 'granted', 'after']) {
    const visible = read(`visible-${phase}`);
    if (
      visible.rendered !== true ||
      visible.hasWorkspace !== (phase === 'granted') ||
      !visible.text
    )
      problems.push(`${phase}: missing or incorrect visible Grant state`);
  }
  for (const phase of ['before', 'granted', 'after']) {
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
  const cleanup = read('cleanup');
  if (!cleanup.removed || !cleanup.sampleUnchanged) problems.push('Fixture cleanup not confirmed');
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
    workspaceId: run.workspaceId,
    grantId: run.grantId,
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
    const problems = grantProblems(run, read);
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
      'Same temporary Workspace Grant authorized in Web, read by the direct attachment-import tool, explicitly revoked and refused; no native file-tool or Shell qualification',
  };
}

export function markdownRow(row, prefix = '.') {
  return formatRow(row, prefix).replace(
    'This row does not qualify the complete Inbox.',
    'Only this temporary Grant and direct attachment-import read are qualified; native file tools, Shell, #1841 and #1957 remain outside this proof.',
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
