import { expect, it } from 'vitest';
import { formatTeamSecurityReport } from '../team-security-report.mjs';
import { runScenarioAttempts } from '../team-security-scenario.mjs';

it('records every inconclusive attempt and stops after the retry limit', async () => {
  const attempts = await runScenarioAttempts(() => 'no native tool call was recorded', 3);
  expect(attempts.map(({ number, result }) => [number, result])).toEqual([
    [1, 'inconclusive'],
    [2, 'inconclusive'],
    [3, 'inconclusive'],
  ]);
  const report = formatTeamSecurityReport({
    scenarios: [{ id: 'B5-codex', summary: 'Full access', ...attempts.at(-1), attempts }],
  });
  for (const number of [1, 2, 3])
    expect(report).toContain(
      `| B5-codex | ${number} | inconclusive | 0/0 · no native tool call was recorded |`,
    );
});

it('preserves an inconclusive attempt when a fresh attempt passes or fails', async () => {
  for (const ok of [true, false]) {
    const attempts = await runScenarioAttempts((check, _block, number) => {
      check('tool completed', number === 1 ? null : ok);
    }, 3);
    expect(attempts.map(({ result }) => result)).toEqual(['inconclusive', ok ? 'pass' : 'fail']);
    expect(attempts[0].checks[0].ok).toBeNull();
  }
});
