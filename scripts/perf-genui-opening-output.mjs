export function writeGenuiOpeningResult(manifest, redact) {
  const message = (value) => redact(value).slice(0, 2000);
  const failure = (phase, detail) =>
    console.error(`[genui-opening] ${JSON.stringify({ phase, ...detail })}`);
  if (manifest.failure) failure('run', { message: message(manifest.failure) });
  for (const target of manifest.publications ?? []) {
    if (!target.previewFailure) continue;
    failure('preview', {
      pair: target.pair,
      arm: target.arm,
      code: message(target.previewFailure.code),
      message: message(target.previewFailure.message),
      elapsedMs: target.previewFailure.elapsedMs,
    });
  }
  for (const result of manifest.budgetResult.failures) {
    failure('budget', {
      metric: result.metric,
      actual: result.actual ?? 'missing',
      ...(result.min === undefined ? {} : { min: result.min }),
      ...(result.max === undefined ? {} : { max: result.max }),
    });
  }
  for (const phase of ['cleanupFailures', 'pageErrors']) {
    for (const error of manifest.summary[phase] ?? []) failure(phase, { message: message(error) });
  }
  console.log(
    JSON.stringify({
      status: manifest.status,
      ...manifest.summary,
      budget: manifest.budgetResult,
    }),
  );
}
