import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { behavior as idleBehavior, coverageRow } from './activity-idle-report.mjs';
import { behavior as grantBehavior, coverageRow as grantRow } from './workspace-grant-report.mjs';
import { checkFeatureMap } from './check-feature-map.mjs';
import { auditInventory, categories } from './verification-inventory.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const issue = (number) => `https://github.com/BotHarness/DeepSeekBot/issues/${number}`;
const sha = (value) => /^[a-f0-9]{40}$/u.test(value ?? '');
const unique = (values) => [...new Set(values)];

export function verificationReport({
  repo = root,
  commit,
  dirty = false,
  activityRun,
  workspaceRun,
  inventory,
} = {}) {
  if (!sha(commit)) throw new Error('Report requires a full source commit');
  const audit = auditInventory(repo, inventory);
  const map = checkFeatureMap(repo);
  const errors = [...audit.errors, ...map.errors];
  const idle = coverageRow(activityRun, commit, dirty);
  if (activityRun && !audit.inventory.behaviors.some((row) => row.id === idleBehavior))
    errors.push('Selected Activity Center evidence has no matching inventory behavior');
  if (activityRun) {
    try {
      if (
        JSON.parse(readFileSync(resolve(activityRun, 'run.json'), 'utf8')).behavior !== idleBehavior
      )
        errors.push('Selected evidence belongs to a different behavior');
    } catch {
      errors.push('Selected evidence run record is missing or invalid');
    }
  }
  const workspace = grantRow(workspaceRun, commit, dirty);
  if (workspaceRun && !audit.inventory.behaviors.some((row) => row.id === grantBehavior))
    errors.push('Selected Workspace evidence has no matching inventory behavior');
  if (workspaceRun) {
    try {
      if (
        JSON.parse(readFileSync(resolve(workspaceRun, 'run.json'), 'utf8')).behavior !==
        grantBehavior
      )
        errors.push('Selected Workspace evidence belongs to a different behavior');
    } catch {
      errors.push('Selected Workspace evidence run record is missing or invalid');
    }
  }
  const rows = audit.inventory.behaviors.map((row) => {
    const scripts = unique(
      audit.inventory.scripts
        .filter((script) => script.behaviors?.includes(row.id))
        .map((script) => script.path),
    );
    return {
      ...row,
      scripts,
      pathKind: row.guide
        ? audit.inventory.scripts.some(
            (script) => script.category === 'mapped' && script.behaviors?.includes(row.id),
          )
          ? 'scripted'
          : 'manual'
        : 'gap',
      result:
        row.id === idleBehavior
          ? idle
          : row.id === grantBehavior
            ? workspace
            : {
                status: 'not-run',
                commit,
                reason:
                  'No current run selected; instructions and script assertions are not execution evidence',
                evidence: [],
                humanQA: 'not-run',
                model: 'not-run',
                native: 'not-run',
                im: 'not-run',
              },
    };
  });
  const classification = Object.fromEntries(
    categories.map((category) => [
      category,
      audit.inventory.scripts.filter((row) => row.category === category).length,
    ]),
  );
  const passed = rows.filter((row) => row.result.status === 'pass').length;
  return {
    version: 1,
    ok: errors.length === 0,
    commit,
    dirty,
    auditedBase: audit.inventory.auditedBase,
    boundary: audit.inventory.boundary,
    metrics: {
      featureDocuments: audit.documents.length,
      scripts: {
        total: audit.available.length,
        mapped: audit.mapped.length,
        mappingRate: audit.available.length ? audit.mapped.length / audit.available.length : null,
        classification,
      },
      behaviorPaths: {
        total: null,
        coverageRate: null,
        reason:
          'Product behavior denominator incomplete; catalogue groups acceptance paths and is not exhaustive',
        inventoried: rows.length,
        scripted: rows.filter((r) => r.pathKind === 'scripted').length,
        manual: rows.filter((r) => r.pathKind === 'manual').length,
        gaps: rows.filter((r) => r.pathKind === 'gap').length,
      },
      verifiedBehaviors: {
        total: null,
        rate: null,
        passed,
        inventoried: rows.length,
        catalogueRate: rows.length ? passed / rows.length : null,
      },
    },
    native: audit.inventory.native,
    behaviors: rows,
    scripts: audit.inventory.scripts,
    errors,
  };
}

const safe = (value) =>
  String(value ?? '')
    .replaceAll('|', '\\|')
    .replaceAll('\n', ' ');
const link = (label, target) => `[${safe(label)}](${target})`;
export function reportMarkdown(
  report,
  { sourcePrefix = '.', evidencePrefix = '.', workspaceEvidencePrefix = '.' } = {},
) {
  const source = (path) => link(path, `${sourcePrefix}/${path}`);
  const { metrics } = report;
  const lines = [
    '# Verification inventory',
    '',
    `Source: \`${report.commit}\`; dirty: ${report.dirty}. Inventory audit base: \`${report.auditedBase}\`.`,
    '',
    report.boundary,
    '',
    `Reference integrity: **${report.ok ? 'pass (static only)' : 'fail'}**. No journey is executed by this report.`,
    '',
    '| Metric | Value |',
    '| --- | --- |',
    `| Feature documents | ${metrics.featureDocuments} |`,
    `| Script mapping (unique files; all files retained) | ${metrics.scripts.mapped}/${metrics.scripts.total} (${((metrics.scripts.mappingRate ?? 0) * 100).toFixed(1)}%) |`,
    '| Product functional-path coverage | unknown — incomplete behavior denominator |',
    `| Inventoried path groups (not the product denominator) | ${metrics.behaviorPaths.inventoried}: ${metrics.behaviorPaths.scripted} scripted, ${metrics.behaviorPaths.manual} manual, ${metrics.behaviorPaths.gaps} gaps |`,
    '| Product verified-behavior rate | unknown — incomplete behavior denominator |',
    `| Qualified catalogue rows only | ${metrics.verifiedBehaviors.passed}/${metrics.verifiedBehaviors.inventoried} |`,
    '',
    '| Script classification | Files |',
    '| --- | --- |',
    ...Object.entries(metrics.scripts.classification).map(
      ([category, count]) => `| ${category} | ${count} |`,
    ),
    '',
    '## Behavior paths',
    '',
    '| Behavior | Current implemented path / source | Path or explicit gap | Current result | Candidate scripts |',
    '| --- | --- | --- | --- | --- |',
    ...report.behaviors.map(
      (row) =>
        `| ${row.id} | ${safe(row.label)}; ${source(row.source)} | ${row.guide ? `${row.pathKind}: ${source(row.guide)}` : `${safe(row.gap)} ${link(`#${row.task}`, issue(row.task))}`} | **${row.result.status}** — ${safe(row.result.reason)} | ${row.scripts.map(source).join(', ') || 'none'} |`,
    ),
    '',
    '## Selected runtime evidence',
    '',
  ];
  for (const row of report.behaviors.filter((entry) => entry.result.recordedStatus)) {
    const result = row.result;
    const prefix = row.id === grantBehavior ? workspaceEvidencePrefix : evidencePrefix;
    lines.push(
      `### ${row.id}`,
      '',
      `Status: **${result.status}**; recorded status: ${result.recordedStatus}; recorded source: \`${result.recordedCommit}\`; evaluated source: \`${report.commit}\`.`,
      '',
      `Observed: ${safe(result.observedAt)}. Environment: ${safe(JSON.stringify(result.environment))}.`,
      '',
      `Expected: ${safe(result.expected)}. Actual: ${safe(result.actual ?? result.reason)}.`,
      '',
      `Evidence: ${result.evidence.map((name) => link(name, `${prefix}/${name}`)).join(', ') || 'partial/missing'}.`,
      '',
      'Human QA, model, native device and IM: not run in this report. Historical Human acceptance of #1972 does not qualify this source.',
      '',
    );
  }
  lines.push('## Native provenance — historical only', '');
  for (const row of report.native ?? [])
    lines.push(
      `- ${link(`#${row.task}`, issue(row.task))}: ${safe(row.scope)} Source \`${row.sourceCommit}\`; evidence \`${row.evidenceCommit}\`; device: ${safe(row.device)}. ${link('Recorded evidence', row.url)}. **needs-revalidation** for this report. Unverified: ${safe(row.unverified)}.`,
      '',
    );
  lines.push(
    'No native device, Simulator, Metro or shared QA Host was operated. Mobile Web scripts do not qualify native behavior.',
    '',
    '## Complete script ownership',
    '',
    '| Script | Classification | Behaviors | Audit reason / prerequisites | Tracking |',
    '| --- | --- | --- | --- | --- |',
    ...report.scripts.map(
      (row) =>
        `| ${source(row.path)} | ${row.category} | ${unique(row.behaviors).join(', ')} | ${safe(row.reason)} | ${link(`#${row.task}`, issue(row.task))} |`,
    ),
    '',
    ...report.errors.map((error) => `ERROR: ${safe(error)}`),
  );
  return `${lines.join('\n')}\n`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({
    options: {
      json: { type: 'boolean' },
      'activity-run': { type: 'string' },
      'workspace-run': { type: 'string' },
      'workspace-evidence-prefix': { type: 'string' },
      'source-prefix': { type: 'string' },
      'evidence-prefix': { type: 'string' },
    },
  });
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  const report = verificationReport({
    commit: git('rev-parse', 'HEAD'),
    dirty: git('status', '--porcelain').length > 0,
    activityRun: values['activity-run'],
    workspaceRun: values['workspace-run'],
  });
  console.log(
    values.json
      ? JSON.stringify(report, null, 2)
      : reportMarkdown(report, {
          sourcePrefix: values['source-prefix'],
          workspaceEvidencePrefix:
            values['workspace-evidence-prefix'] ??
            (values['workspace-run']
              ? relative(process.cwd(), resolve(values['workspace-run']))
              : '.'),
          evidencePrefix:
            values['evidence-prefix'] ??
            (values['activity-run']
              ? relative(process.cwd(), resolve(values['activity-run']))
              : '.'),
        }),
  );
  process.exitCode = report.ok ? 0 : 1;
}
