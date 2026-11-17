import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { it } from 'vitest';

import { runSuite, type ModelEndpoint } from './harness.js';
import { rescore, SCENARIOS } from './scenarios.js';
import { compare, markdown, type EvalReport } from './score.js';

const env = process.env;

function endpoint(): ModelEndpoint {
  if (env['INBOX_EVAL_PROVIDER'] !== 'deepseek' && env['OPENCODE_GO_API_KEY'])
    return {
      baseUrl: 'https://opencode.ai/inference/go/openai/v1',
      apiKey: env['OPENCODE_GO_API_KEY'],
      model: env['INBOX_EVAL_MODEL'] ?? 'deepseek-v4.1-flash',
      headers: { 'x-opencode-session': `inbox-eval-${Date.now()}` },
    };
  if (!env['DEEPSEEK_API_KEY']) throw new Error('Set OPENCODE_GO_API_KEY or DEEPSEEK_API_KEY');
  return {
    baseUrl: 'https://api.deepseek.com',
    apiKey: env['DEEPSEEK_API_KEY'],
    model: env['INBOX_EVAL_MODEL'] ?? 'deepseek-flash',
  };
}

it('runs the Bot Inbox rendering eval against a live model', async () => {
  const runs = Number(env['INBOX_EVAL_RUNS'] ?? 5);
  const only = env['INBOX_EVAL_SCENARIOS']?.split(',');
  const scenarios = only ? SCENARIOS.filter((scenario) => only.includes(scenario.id)) : SCENARIOS;
  const label = env['INBOX_EVAL_LABEL'] ?? 'candidate';
  const out = resolve(
    env['INBOX_EVAL_OUT'] ?? join('.humanlayer', 'inbox-eval', `${label}-${Date.now()}.json`),
  );
  const load = (path: string) => {
    const saved = JSON.parse(readFileSync(path, 'utf8')) as EvalReport;
    return { ...saved, runs: saved.runs.map(rescore) };
  };
  const report = env['INBOX_EVAL_RESCORE']
    ? load(env['INBOX_EVAL_RESCORE'])
    : await runSuite(endpoint(), scenarios, { runs, label, log: (line) => console.log(line) });
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(report, null, 1));
  const baseline = env['INBOX_EVAL_BASELINE'] ? load(env['INBOX_EVAL_BASELINE']) : undefined;
  const verdict = baseline ? compare(baseline, report) : undefined;
  const summary = markdown(baseline, report, verdict);
  writeFileSync(out.replace(/\.json$/u, '.md'), summary);
  console.log(summary);
});
