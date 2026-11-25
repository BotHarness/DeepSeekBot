#!/usr/bin/env node

import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const directory = resolve(process.argv[2] ?? 'docs/adr');
const files = existsSync(directory) ? readdirSync(directory, { recursive: true }) : [];

if (files.length > 0) {
  for (const file of files) {
    process.stderr.write(
      `docs/adr/${file} [no-adr-files] record the decision as a section of docs/decisions/<topic>.md with an <a id="adr-NNNN"></a> or descriptive anchor, a Why: paragraph and an Enforced by: line; see docs/agents/domain.md\n`,
    );
  }
  process.exitCode = 1;
} else {
  process.stdout.write('No numbered ADR files; decisions live in docs/decisions/.\n');
}
