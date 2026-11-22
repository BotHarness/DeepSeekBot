import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const SOURCE = join(import.meta.dirname, '../src');

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith('.ts') ? [relative(SOURCE, path).split('\\').join('/')] : [];
  });

export const sourceFilesMatching = (pattern: RegExp): string[] =>
  sourceFiles(SOURCE)
    .filter((file) => pattern.test(readFileSync(join(SOURCE, file), 'utf8')))
    .sort();

export const writesTables = (tables: readonly string[]): RegExp =>
  new RegExp(
    `(INSERT(\\s+OR\\s+[A-Z]+)?\\s+INTO|UPDATE|DELETE\\s+FROM)\\s+(${tables.join('|')})\\b`,
    'u',
  );
