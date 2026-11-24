function checksSummary(item) {
  return `${item.checks.filter((check) => check.ok).length}/${item.checks.length}${item.error ? ` · ${item.error.replaceAll('|', '/').slice(0, 160)}` : ''}`;
}

function attemptDetails(attempt) {
  return attempt.checks
    .filter((check) => check.ok === false)
    .map(({ name, detail }) => (detail === undefined ? name : `${name}: ${detail}`))
    .join('; ');
}

export function formatTeamSecurityReport(report) {
  const lines = [
    `# Team mode security suite`,
    '',
    `Source ${report.source} · ${report.startedAt} · ${report.passed}/${report.total} passed · ${report.inconclusive} inconclusive`,
    '',
    `Isolation: ${report.isolation ?? 'unknown'}`,
    '',
    '| Scenario | Result | Checks |',
    '| --- | --- | --- |',
  ];
  for (const item of report.scenarios)
    lines.push(`| ${item.id} ${item.summary} | ${item.result} | ${checksSummary(item)} |`);
  const retried = report.scenarios.filter((item) => item.attempts !== undefined);
  if (retried.length) {
    lines.push(
      '',
      '## Scenario attempts',
      '',
      '| Scenario | Attempt | Result | Checks | Failed checks |',
      '| --- | --- | --- | --- | --- |',
    );
    for (const item of retried)
      for (const attempt of item.attempts)
        lines.push(
          `| ${item.id} | ${attempt.number} | ${attempt.result} | ${checksSummary(attempt)} | ${attemptDetails(attempt)} |`,
        );
  }
  return `${lines.join('\n')}\n`;
}
