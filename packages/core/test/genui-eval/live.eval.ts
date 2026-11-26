import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { it } from 'vitest';
import { previewGenuiDocument } from '../../src/runtime/genui-preview.js';
import { runScenario, serialBrowser, type GenuiEvalRun } from './harness.js';
import { GENUI_EVAL_SCENARIOS } from './scenarios.js';

const env = process.env;

it('measures GenUI authoring tokens and correctness against a live model', async () => {
  const apiKey = env['OPENCODE_GO_API_KEY'];
  if (!apiKey) throw new Error('Set OPENCODE_GO_API_KEY');
  const arm = env['GENUI_EVAL_ARM'] ?? 'candidate';
  const runs = Number(env['GENUI_EVAL_RUNS'] ?? 5);
  const concurrency = Number(env['GENUI_EVAL_CONCURRENCY'] ?? 4);
  const browserPath = env['GENUI_EVAL_BROWSER'] ?? '/opt/pw-browsers/chromium';
  const only = env['GENUI_EVAL_SCENARIOS']?.split(',');
  const out = resolve(env['GENUI_EVAL_OUT'] ?? join('.humanlayer', 'genui-eval', arm));
  mkdirSync(out, { recursive: true });
  const endpoint = {
    baseUrl: 'https://opencode.ai/inference/go/openai/v1',
    apiKey,
    model: env['GENUI_EVAL_MODEL'] ?? 'deepseek-v4.1-flash',
    headers: { 'x-opencode-session': `genui-eval-${arm}-${Date.now()}` },
  };
  if (
    !Number.isSafeInteger(runs) ||
    runs < 1 ||
    !Number.isSafeInteger(concurrency) ||
    concurrency < 1
  )
    throw new Error('GENUI_EVAL_RUNS and GENUI_EVAL_CONCURRENCY must be positive integers');
  const scenarios = GENUI_EVAL_SCENARIOS.filter((scenario) => !only || only.includes(scenario.id));
  const unknown = only?.filter(
    (id) => !GENUI_EVAL_SCENARIOS.some((scenario) => scenario.id === id),
  );
  if (scenarios.length === 0 || (unknown?.length ?? 0) > 0)
    throw new Error(`Unknown or empty GENUI_EVAL_SCENARIOS: ${unknown?.join(',') ?? ''}`);
  const jobs = scenarios.flatMap((scenario) =>
    Array.from({ length: runs }, (_, index) => ({ scenario, index })),
  );
  const results: GenuiEvalRun[] = [];
  let cursor = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (cursor < jobs.length) {
        const job = jobs[cursor++]!;
        const result = await runScenario(endpoint, job.scenario, {
          arm,
          index: job.index,
          browserPath,
        }).catch((error: unknown): GenuiEvalRun => ({
          arm,
          scenario: job.scenario.id,
          index: job.index,
          usage: { input: 0, cacheRead: 0, output: 0, steps: 0 },
          durationMs: 0,
          tools: [],
          errors: [`harness: ${error instanceof Error ? error.message : String(error)}`],
          published: false,
          renders: false,
          checks: { passed: 0, total: 1, missing: ['harness'] },
          correct: false,
        }));
        results.push(result);
        console.log(
          `${arm} ${result.scenario}#${result.index} out=${result.usage.output} in=${result.usage.input} steps=${result.usage.steps} correct=${result.correct} checks=${result.checks.passed}/${result.checks.total} tools=${result.tools.join('>')} errors=${result.errors.length}`,
        );
        writeFileSync(join(out, 'runs.json'), JSON.stringify(results, null, 1));
      }
    }),
  );
  for (const scenario of scenarios) {
    const sample = results.find((run) => run.scenario === scenario.id && run.correct);
    if (sample?.document === undefined) continue;
    for (const theme of ['light', 'dark'] as const) {
      const shot = await serialBrowser(() =>
        previewGenuiDocument(sample.document, { browserPath, theme, width: 728 }),
      );
      writeFileSync(
        join(out, `${scenario.id}-${theme}.png`),
        Buffer.from(shot.screenshot.data, 'base64'),
      );
    }
  }
});
