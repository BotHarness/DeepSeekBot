#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { BASELINES } from './check-ui-visual.mjs';
import { publishEvidence } from './pr-evidence.mjs';

const REPO = 'BotHarness/DeepSeekBot';
const CASE = /^case-([\w-]+)\.png$/u;

export function caseFiles(directory) {
  return readdirSync(directory)
    .map((name) => [CASE.exec(name)?.[1], join(directory, name)])
    .filter(([id]) => id)
    .sort(([a], [b]) => a.localeCompare(b));
}

export function manifestFrom(receipts) {
  return Object.fromEntries(
    [...receipts].sort(([a], [b]) => a.localeCompare(b)).map(([id, receipt]) => [id, receipt.url]),
  );
}

function fromRun(run) {
  const directory = mkdtempSync(join(tmpdir(), 'ui-visual-'));
  execFileSync(
    'gh',
    ['run', 'download', run, '--repo', REPO, '--name', 'ui-visual', '--dir', directory],
    {
      stdio: 'inherit',
      shell: false,
      windowsHide: true,
    },
  );
  const sha = execFileSync(
    'gh',
    ['api', `repos/${REPO}/actions/runs/${run}`, '--jq', '.head_sha'],
    {
      encoding: 'utf8',
      shell: false,
      windowsHide: true,
    },
  ).trim();
  return { directory, sha };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { values } = parseArgs({
    options: { run: { type: 'string' }, dir: { type: 'string' }, 'source-sha': { type: 'string' } },
  });
  if (!values.run === !values.dir) {
    console.error(
      'Usage: node scripts/ui-visual-baseline.mjs --run <verify run id>\n' +
        '   or: node scripts/ui-visual-baseline.mjs --dir <screenshots> --source-sha <commit>\n' +
        'Adopt CI screenshots only after reviewing them; local renders differ from the CI runner.',
    );
    process.exit(1);
  }
  const { directory, sha } = values.run
    ? fromRun(values.run)
    : { directory: values.dir, sha: values['source-sha'] };
  const receipts = [];
  for (const [id, filename] of caseFiles(directory)) {
    const receipt = await publishEvidence({ filename, sourceSha: sha, reviewed: true });
    receipts.push([id, receipt]);
    console.log(`${id}: ${receipt.url}`);
  }
  if (!receipts.length) throw new Error(`No case-*.png screenshots in ${directory}`);
  const previous = JSON.parse(readFileSync(BASELINES, 'utf8'));
  const next = manifestFrom(receipts);
  writeFileSync(BASELINES, `${JSON.stringify(next, null, 2)}\n`);
  const changed = Object.keys(next).filter((id) => previous[id] !== next[id]);
  console.log(
    `Updated ${changed.length} of ${receipts.length} baselines in scripts/ui-visual/baselines.json`,
  );
}
