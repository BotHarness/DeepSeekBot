import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { it } from 'vitest';
import { previewGenuiDocument } from '../../src/runtime/genui-preview.js';
import type { GenuiEvalRun } from './harness.js';

it('renders the best published document per scenario', async () => {
  const dir = process.env['GENUI_EVAL_RENDER']!;
  const runs = JSON.parse(readFileSync(join(dir, 'runs.json'), 'utf8')) as GenuiEvalRun[];
  const best = new Map<string, GenuiEvalRun>();
  for (const run of runs) {
    if (run.document === undefined || !run.renders) continue;
    const current = best.get(run.scenario);
    if (!current || run.checks.passed > current.checks.passed || (run.correct && !current.correct))
      best.set(run.scenario, run);
  }
  for (const [scenario, run] of best)
    for (const theme of ['light', 'dark'] as const) {
      const shot = await previewGenuiDocument(run.document, {
        browserPath: process.env['GENUI_EVAL_BROWSER'] ?? '/opt/pw-browsers/chromium',
        theme,
        width: 728,
      });
      writeFileSync(
        join(dir, `best-${scenario}-${theme}.png`),
        Buffer.from(shot.screenshot.data, 'base64'),
      );
      console.log(scenario, theme, run.index, run.checks.passed, '/', run.checks.total);
    }
});
