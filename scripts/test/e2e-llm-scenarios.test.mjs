import { describe, expect, it } from 'vitest';

import {
  SCENARIOS,
  compareReports,
  modelLabel,
  parseModelRoute,
  parseScenarioArgs,
  renderMarkdown,
  selectScenarios,
  sumHostRows,
  sumSessionTotals,
  summarizeAttempts,
} from '../e2e-llm-scenarios.mjs';

describe('real-model scenario selection', () => {
  it('runs every scenario by default and named ones on request', () => {
    expect(selectScenarios(parseScenarioArgs([]))).toEqual(SCENARIOS);
    expect(
      selectScenarios(parseScenarioArgs(['--scenario', 'worker-reports-to-coordinator'])).map(
        (scenario) => scenario.id,
      ),
    ).toEqual(['worker-reports-to-coordinator']);
  });

  it('keeps only scenarios whose areas the changed files touch', () => {
    const options = parseScenarioArgs(['--changed-from', 'origin/main']);
    expect(selectScenarios(options, ['docs/bot-cli.md'])).toEqual([]);
    expect(
      selectScenarios(options, ['packages/core/src/runtime/bot-runtime.ts']).map(
        (scenario) => scenario.id,
      ),
    ).toContain('worker-reports-to-coordinator');
  });

  it('refuses unknown scenarios and out-of-range attempts', () => {
    expect(() => parseScenarioArgs(['--scenario', 'nope'])).toThrow('unknown scenario');
    expect(() => parseScenarioArgs(['--attempts', '9'])).toThrow('--attempts');
    expect(parseScenarioArgs(['--launch', '--attempts', '3', '--timeout', '60'])).toMatchObject({
      launch: true,
      attempts: 3,
      timeoutSeconds: 60,
    });
  });

  it('gives every scenario a unique id, areas and a runnable body', () => {
    expect(new Set(SCENARIOS.map((scenario) => scenario.id)).size).toBe(SCENARIOS.length);
    for (const scenario of SCENARIOS) {
      expect(scenario.areas.length).toBeGreaterThan(0);
      expect(typeof scenario.run).toBe('function');
    }
  });
});

const row = (overrides = {}) => ({
  provider: 'opencode-go',
  model: 'deepseek-v4-flash',
  inputTokens: 100,
  outputTokens: 20,
  cacheReadTokens: 300,
  cacheWriteTokens: 0,
  ...overrides,
});

const attempt = (result, totalTokens, extra = {}) => ({
  result,
  usage: {
    inputTokens: totalTokens / 2,
    outputTokens: totalTokens / 4,
    cacheReadTokens: totalTokens / 4,
    cacheWriteTokens: 0,
    totalTokens,
    settled: true,
    hostMatches: true,
    ...extra,
  },
});

describe('scenario token usage and model matrix', () => {
  it('parses model routes with an optional effort and refuses malformed ones', () => {
    expect(parseModelRoute('opencode-go/deepseek-v4-flash')).toEqual({
      provider: 'opencode-go',
      model: 'deepseek-v4-flash',
    });
    expect(parseModelRoute('deepseek/deepseek-v4-pro@low')).toEqual({
      provider: 'deepseek',
      model: 'deepseek-v4-pro',
      reasoningEffort: 'low',
    });
    expect(modelLabel(parseModelRoute('deepseek/deepseek-v4-pro@low'))).toBe(
      'deepseek/deepseek-v4-pro@low',
    );
    expect(modelLabel(undefined)).toBe('host-default');
    expect(() => parseModelRoute('deepseek-v4-flash')).toThrow('provider/model');
    expect(() => parseScenarioArgs(['--model', 'a/b', '--model', 'a/b'])).toThrow('twice');
  });

  it('runs a fixed number of times instead of retrying, but not both', () => {
    expect(parseScenarioArgs(['--runs', '5', '--model', 'a/b'])).toMatchObject({
      runs: 5,
      models: [{ provider: 'a', model: 'b' }],
    });
    expect(() => parseScenarioArgs(['--runs', '3', '--attempts', '2'])).toThrow('--runs replaces');
    expect(() => parseScenarioArgs(['--runs', '0'])).toThrow('--runs');
  });

  it('sums the native Session totals of the scenario Bots only', () => {
    const record = (slug, totals, lastUsed) => ({
      identity: { cwd: `/home/botharness/bots/${slug}/memory` },
      rows: {
        tokenUsage: { val: { totals } },
        modelSelection: { val: { lastUsed } },
      },
    });
    const route = { provider: 'opencode-go', model: 'deepseek-v4-flash' };
    const usage = sumSessionTotals(
      [
        record(
          'aura',
          { uncachedInputTokens: 100, outputTokens: 20, cacheReadTokens: 300, cacheWriteTokens: 0 },
          route,
        ),
        record('nexus', { uncachedInputTokens: 50, outputTokens: 10, cacheReadTokens: 200 }, route),
        record('someone-else', { uncachedInputTokens: 9999, outputTokens: 1 }, route),
        { identity: { cwd: '/elsewhere' } },
      ],
      ['aura', 'nexus'],
    );
    expect(usage).toEqual({
      inputTokens: 150,
      outputTokens: 30,
      cacheReadTokens: 500,
      cacheWriteTokens: 0,
      totalTokens: 680,
      sessions: 2,
      routes: ['opencode-go/deepseek-v4-flash'],
    });
  });

  it('keeps a Host bucket unknown when any row has it unknown', () => {
    const usage = sumHostRows([
      row(),
      row({ model: 'other', cacheReadTokens: null, totalTokens: 9 }),
    ]);
    expect(usage).toMatchObject({
      inputTokens: 200,
      cacheReadTokens: null,
      routes: ['opencode-go/deepseek-v4-flash', 'opencode-go/other'],
    });
    expect(usage.totalTokens).toBeNull();
    expect(sumHostRows([row({ totalTokens: 420 })]).totalTokens).toBe(420);
  });

  it('reports pass rate, mean tokens and cache hit rate across runs', () => {
    const stats = summarizeAttempts([attempt('pass', 1000), attempt('fail', 2000)]);
    expect(stats).toMatchObject({
      runs: 2,
      passed: 1,
      passRate: 0.5,
      minTotalTokens: 1000,
      maxTotalTokens: 2000,
      usageComplete: true,
    });
    expect(stats.meanTokens).toEqual({
      inputTokens: 750,
      outputTokens: 375,
      cacheReadTokens: 375,
      cacheWriteTokens: 0,
      totalTokens: 1500,
    });
    expect(stats.cacheHitRate).toBe(0.3333);
  });

  it('shows the pass-rate and token delta of a design change per scenario and model', () => {
    const entry = (id, model, attempts) => ({
      id,
      model,
      stats: summarizeAttempts(attempts),
    });
    const baseline = {
      commit: 'aaaaaaaaaaaaaaaa',
      scenarios: [
        entry('two-workers-report', 'a/b', [attempt('fail', 4000), attempt('pass', 4000)]),
        entry('dm-reply', 'a/b', [attempt('pass', 800)]),
      ],
    };
    const current = {
      result: 'pass',
      commit: 'bbbbbbbbbbbbbbbb',
      scenarios: [
        entry('two-workers-report', 'a/b', [attempt('pass', 3000), attempt('pass', 3000)]),
        entry('coordinator-delegates', 'a/b', [attempt('pass', 1200)]),
      ],
    };
    const rows = compareReports(baseline, current);
    const changed = rows.find((item) => item.id === 'two-workers-report');
    expect(changed).toMatchObject({
      passRateDelta: 0.5,
      totalTokensChange: -0.25,
    });
    expect(changed.tokenDelta.totalTokens).toBe(-1000);
    expect(rows.find((item) => item.id === 'dm-reply').current).toBeNull();
    expect(rows.find((item) => item.id === 'coordinator-delegates').baseline).toBeNull();
    const markdown = renderMarkdown(current, {
      baselineCommit: baseline.commit,
      rows,
    });
    expect(markdown).toContain(
      '| two-workers-report | a/b | 2/2 | 1,500 | 750 | 750 | 0 | 3,000 | 33% |',
    );
    expect(markdown).toContain('| two-workers-report | a/b | 50% → 100% |');
    expect(markdown).toContain('-1,000 (-25%)');
    expect(markdown).toContain('| coordinator-delegates | a/b | new |');
  });
});
