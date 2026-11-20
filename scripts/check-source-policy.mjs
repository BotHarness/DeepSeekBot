#!/usr/bin/env node
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanRepository } from './source-policy.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function describe(item) {
  return `${item.path}:${item.line}:${item.column} ${item.kind}: ${item.token.replace(/\s+/g, ' ').slice(0, 100)}`;
}

try {
  const files = process.argv
    .slice(2)
    .map((path) => relative(root, resolve(path)).replaceAll('\\', '/'));
  const issues = await scanRepository(root, files.length ? files : undefined);
  if (issues.length) {
    console.error(
      'Code comments, React useEffect calls and whole client-store subscriptions are prohibited (docs/agents/ui-state.md):',
    );
    for (const item of issues) console.error(describe(item));
    process.exitCode = 1;
  } else {
    console.log(
      'source policy: no code comments, React useEffect calls or whole client-store subscriptions',
    );
  }
} catch (error) {
  console.error(`source policy: ${error.message}`);
  process.exitCode = 1;
}
