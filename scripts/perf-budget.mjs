import { readFileSync } from 'node:fs';

export function readBudget(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function valueAt(summary, path) {
  let value = summary;
  for (const part of path.split('.')) {
    if (value === null || value === undefined) return undefined;
    value = value[part];
  }
  return Array.isArray(value) ? value.length : value;
}

export function checkBudget(summary, budget, { strictTiming = false } = {}) {
  const mode = summary.animate ? 'animate' : 'idle';
  const rules = [...(budget.always ?? []), ...(budget[mode] ?? [])];
  const results = rules.map((rule) => {
    const limit = rule.min === 'seeded' ? summary.seeded : rule.min;
    const actual = valueAt(summary, rule.metric);
    let pass;
    if (typeof actual !== 'number') pass = false;
    else if (rule.max !== undefined && actual > rule.max) pass = false;
    else if (limit !== undefined && actual < limit) pass = false;
    else pass = true;
    return {
      metric: rule.metric,
      kind: rule.kind,
      actual,
      ...(rule.max === undefined ? {} : { max: rule.max }),
      ...(limit === undefined ? {} : { min: limit }),
      pass,
      blocking: rule.kind === 'structure' || strictTiming,
      why: rule.why,
    };
  });
  return {
    budget: budget.name,
    mode,
    pass: results.every((result) => result.pass || !result.blocking),
    failures: results.filter((result) => !result.pass && result.blocking),
    warnings: results.filter((result) => !result.pass && !result.blocking),
    results,
  };
}
