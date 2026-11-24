export function classifyScenario(checks, blocked, inconclusive) {
  if (checks.some((item) => item.ok !== null && !item.ok)) return 'fail';
  if (blocked !== undefined) return 'blocked';
  return inconclusive !== undefined || checks.some((item) => item.ok === null)
    ? 'inconclusive'
    : 'pass';
}

export async function runScenarioAttempts(run, maxAttempts) {
  const attempts = [];
  for (let number = 1; number <= maxAttempts; number += 1) {
    const started = Date.now();
    const checks = [];
    let blocked;
    const check = (name, ok, detail) => {
      checks.push({
        name,
        ok: ok === null ? null : Boolean(ok),
        ...(detail === undefined ? {} : { detail }),
      });
      return ok;
    };
    let result;
    let error;
    try {
      const inconclusive = await run(
        check,
        (reason) => {
          blocked = reason;
        },
        number,
      );
      result = classifyScenario(checks, blocked, inconclusive);
      error = blocked ?? inconclusive;
    } catch (cause) {
      result = 'fail';
      error = String(cause?.message ?? cause).slice(0, 800);
    }
    attempts.push({
      number,
      result,
      checks,
      ...(error === undefined ? {} : { error }),
      ms: Date.now() - started,
    });
    if (result !== 'inconclusive') break;
  }
  return attempts;
}
