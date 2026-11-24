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
    lines.push(
      `| ${item.id} ${item.summary} | ${item.result} | ${item.checks.filter((check) => check.ok).length}/${item.checks.length}${item.error ? ` · ${item.error.replaceAll('|', '/').slice(0, 160)}` : ''} |`,
    );
  return `${lines.join('\n')}\n`;
}
