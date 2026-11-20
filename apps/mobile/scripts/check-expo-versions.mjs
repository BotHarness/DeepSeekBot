import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const parse = (version) => {
  const match = /(\d+)\.(\d+)\.(\d+)/.exec(version ?? '');
  if (!match) throw new Error(`Unreadable version: ${version}`);
  return match.slice(1, 4).map(Number);
};
const line = ([major, minor]) => (major === 0 ? `0.${minor}` : `${major}`);

export function classify(report) {
  if (!report || !Array.isArray(report.dependencies))
    throw new Error('Expected the JSON of `expo install --check --json`');
  const errors = [];
  const warnings = [];
  for (const { packageName, actualVersion, expectedVersionOrRange } of report.dependencies) {
    const message = `${packageName}@${actualVersion}, expected ${expectedVersionOrRange}`;
    const breaking = line(parse(actualVersion)) !== line(parse(expectedVersionOrRange));
    (breaking ? errors : warnings).push(message);
  }
  return { errors, warnings };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { errors, warnings } = classify(JSON.parse(readFileSync(0, 'utf8')));
    for (const message of warnings)
      console.log(`::warning title=Expo patch drift::${message}. Run npx expo install --fix.`);
    for (const message of errors)
      console.log(`::error title=Expo SDK mismatch::${message}. Run npx expo install --fix.`);
    if (!errors.length && !warnings.length) console.log('Dependencies match the Expo SDK.');
    process.exitCode = errors.length ? 1 : 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
