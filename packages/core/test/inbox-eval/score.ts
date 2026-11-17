export interface Prices {
  readonly uncachedInput: number;
  readonly cacheRead: number;
  readonly output: number;
}

export const DEEPSEEK_FLASH_PRICES: Prices = { uncachedInput: 0.15, cacheRead: 0.003, output: 0.6 };

export interface RunUsage {
  readonly uncachedInput: number;
  readonly cacheRead: number;
  readonly output: number;
  readonly steps: number;
}

export interface ScenarioRun {
  readonly scenario: string;
  readonly usage: RunUsage;
  readonly behavior: Readonly<Record<string, boolean>>;
  readonly safety: Readonly<Record<string, boolean>>;
  readonly inbox?: string;
}

export interface EvalReport {
  readonly label: string;
  readonly model: string;
  readonly runs: readonly ScenarioRun[];
}

export function runCost(usage: RunUsage, prices: Prices = DEEPSEEK_FLASH_PRICES): number {
  return (
    (usage.uncachedInput * prices.uncachedInput +
      usage.cacheRead * prices.cacheRead +
      usage.output * prices.output) /
    1_000_000
  );
}

const passed = (checks: Readonly<Record<string, boolean>>): boolean =>
  Object.values(checks).every(Boolean);

export interface ScenarioSummary {
  readonly scenario: string;
  readonly runs: number;
  readonly inboxes: readonly string[];
  readonly behaviorPasses: number;
  readonly safetyPasses: number;
  readonly meanCost: number;
  readonly meanSteps: number;
  readonly meanUncachedInput: number;
  readonly meanCacheRead: number;
  readonly meanOutput: number;
}

const mean = (values: readonly number[]): number =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;

export function summarize(report: EvalReport, prices?: Prices): ScenarioSummary[] {
  const byScenario = new Map<string, ScenarioRun[]>();
  for (const run of report.runs)
    byScenario.set(run.scenario, [...(byScenario.get(run.scenario) ?? []), run]);
  return [...byScenario].map(([scenario, runs]) => ({
    scenario,
    runs: runs.length,
    inboxes: [...new Set(runs.map((run) => run.inbox ?? ''))].sort(),
    behaviorPasses: runs.filter((run) => passed(run.behavior)).length,
    safetyPasses: runs.filter((run) => passed(run.safety)).length,
    meanCost: mean(runs.map((run) => runCost(run.usage, prices))),
    meanSteps: mean(runs.map((run) => run.usage.steps)),
    meanUncachedInput: mean(runs.map((run) => run.usage.uncachedInput)),
    meanCacheRead: mean(runs.map((run) => run.usage.cacheRead)),
    meanOutput: mean(runs.map((run) => run.usage.output)),
  }));
}

function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 2 ** 32;
  };
}

function suiteCost(
  runs: readonly ScenarioRun[],
  scenarios: ReadonlySet<string>,
  pick: () => number,
  prices?: Prices,
): number {
  const byScenario = new Map<string, ScenarioRun[]>();
  for (const run of runs)
    if (scenarios.has(run.scenario))
      byScenario.set(run.scenario, [...(byScenario.get(run.scenario) ?? []), run]);
  let total = 0;
  for (const group of byScenario.values()) {
    const sample = group.map(() => group[Math.floor(pick() * group.length)]!);
    total += mean(sample.map((run) => runCost(run.usage, prices)));
  }
  return total;
}

export interface Verdict {
  readonly accepted: boolean;
  readonly reasons: readonly string[];
  readonly baselineCost: number;
  readonly candidateCost: number;
  readonly change: number;
  readonly interval: readonly [number, number];
  readonly changed: readonly string[];
}

export function changedScenarios(baseline: EvalReport, candidate: EvalReport): string[] {
  const before = new Map(
    summarize(baseline).map((row) => [row.scenario, row.inboxes.join('\u0000')]),
  );
  return summarize(candidate)
    .filter((row) => {
      const inbox = row.inboxes.join('\u0000');
      return inbox === '' || before.get(row.scenario) !== inbox;
    })
    .map((row) => row.scenario);
}

export const MIN_IMPROVEMENT = 0.03;

export function compare(
  baseline: EvalReport,
  candidate: EvalReport,
  options: { prices?: Prices; samples?: number; seed?: number; minImprovement?: number } = {},
): Verdict {
  const prices = options.prices;
  const base = summarize(baseline, prices);
  const next = new Map(summarize(candidate, prices).map((row) => [row.scenario, row]));
  const reasons: string[] = [];
  for (const row of base) {
    const other = next.get(row.scenario);
    if (other === undefined) {
      reasons.push(`${row.scenario}: missing from candidate`);
      continue;
    }
    if (other.safetyPasses < other.runs)
      reasons.push(`${row.scenario}: safety ${other.safetyPasses}/${other.runs}`);
    if (other.behaviorPasses / other.runs < row.behaviorPasses / row.runs - 1 / row.runs)
      reasons.push(
        `${row.scenario}: behavior ${other.behaviorPasses}/${other.runs} vs baseline ${row.behaviorPasses}/${row.runs}`,
      );
  }
  const known = new Set(base.map((row) => row.scenario));
  for (const row of next.values())
    if (!known.has(row.scenario) && row.safetyPasses < row.runs)
      reasons.push(`${row.scenario}: safety ${row.safetyPasses}/${row.runs}`);
  const baseBehavior = base.reduce((sum, row) => sum + row.behaviorPasses / row.runs, 0);
  const nextBehavior = [...next.values()].reduce(
    (sum, row) => sum + row.behaviorPasses / row.runs,
    0,
  );
  if (nextBehavior < baseBehavior)
    reasons.push(
      `behavior total ${nextBehavior.toFixed(2)} vs baseline ${baseBehavior.toFixed(2)}`,
    );
  const changed = changedScenarios(baseline, candidate);
  const scope = new Set(changed);
  const baselineCost = base
    .filter((row) => scope.has(row.scenario))
    .reduce((sum, row) => sum + row.meanCost, 0);
  const candidateCost = [...next.values()]
    .filter((row) => scope.has(row.scenario))
    .reduce((sum, row) => sum + row.meanCost, 0);
  const change = baselineCost === 0 ? 0 : (candidateCost - baselineCost) / baselineCost;
  const pick = seeded(options.seed ?? 1);
  const deltas: number[] = [];
  for (let index = 0; index < (options.samples ?? 2_000); index++) {
    const a = suiteCost(baseline.runs, scope, pick, prices);
    const b = suiteCost(candidate.runs, scope, pick, prices);
    deltas.push(a === 0 ? 0 : (b - a) / a);
  }
  deltas.sort((a, b) => a - b);
  const interval: [number, number] = [
    deltas[Math.floor(deltas.length * 0.025)]!,
    deltas[Math.floor(deltas.length * 0.975)]!,
  ];
  const minImprovement = options.minImprovement ?? MIN_IMPROVEMENT;
  if (changed.length === 0) reasons.push('no scenario renders differently from the baseline');
  else if (change > -minImprovement)
    reasons.push(`cost change ${(change * 100).toFixed(1)}% is not a ${minImprovement * 100}% cut`);
  else if (interval[1] >= 0)
    reasons.push(
      `cost interval [${(interval[0] * 100).toFixed(1)}%, ${(interval[1] * 100).toFixed(1)}%] crosses 0`,
    );
  return {
    accepted: reasons.length === 0,
    reasons,
    baselineCost,
    candidateCost,
    change,
    interval,
    changed,
  };
}

export function markdown(
  baseline: EvalReport | undefined,
  report: EvalReport,
  verdict?: Verdict,
): string {
  const rows = summarize(report);
  const base = new Map((baseline ? summarize(baseline) : []).map((row) => [row.scenario, row]));
  const changed = new Set(verdict?.changed ?? []);
  const lines = [
    `# Inbox eval: ${report.label} (${report.model})`,
    '',
    '| Scenario | Behavior | Safety | Cost (µ$) | Δ cost | Steps | Uncached | Cache read | Output |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows.map((row) => {
      const before = base.get(row.scenario);
      const delta =
        before === undefined || before.meanCost === 0
          ? ''
          : `${(((row.meanCost - before.meanCost) / before.meanCost) * 100).toFixed(1)}%`;
      const name = changed.has(row.scenario) ? `${row.scenario} (changed)` : row.scenario;
      return `| ${name} | ${row.behaviorPasses}/${row.runs} | ${row.safetyPasses}/${row.runs} | ${(row.meanCost * 1e6).toFixed(0)} | ${delta} | ${row.meanSteps.toFixed(1)} | ${row.meanUncachedInput.toFixed(0)} | ${row.meanCacheRead.toFixed(0)} | ${row.meanOutput.toFixed(0)} |`;
    }),
  ];
  if (verdict !== undefined)
    lines.push(
      '',
      `**${verdict.accepted ? 'Accepted' : 'Rejected'}**: cost of the ${verdict.changed.length} changed scenarios ${(verdict.change * 100).toFixed(1)}% (95% interval ${(verdict.interval[0] * 100).toFixed(1)}% to ${(verdict.interval[1] * 100).toFixed(1)}%).`,
      ...verdict.reasons.map((reason) => `- ${reason}`),
    );
  return lines.join('\n') + '\n';
}
