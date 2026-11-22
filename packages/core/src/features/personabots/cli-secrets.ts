import { randomUUID } from 'node:crypto';
import { chmodSync, lstatSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { isMap, isScalar, parseDocument } from 'yaml';
import { withFileLock } from '@deepseek-ai/dsh-atomic-write';
import { parseCredentialsDocument } from '@deepseek-ai/dsh-credentials-local';
import type { BotCreateCliIo, CreateValues } from './cli-types.js';
import { CliFailure } from './cli-errors.js';
import { resolveHome } from './cli-offline.js';

const SECRET_ARGV = new Set([
  'api-key',
  'apikey',
  'api_key',
  'token',
  'secret',
  'password',
  'passwd',
  'credential',
  'credentials',
  'private-key',
  'privatekey',
  'auth-token',
  'access-token',
  'client-secret',
  'session-token',
  'verify-code',
  'verification-code',
]);

export function rejectSecretArgv(argv: readonly string[]): void {
  for (const entry of argv) {
    if (!entry.startsWith('-')) continue;
    const bare = entry.replace(/^-+/, '').split('=')[0]?.toLowerCase() ?? '';
    if (
      SECRET_ARGV.has(bare) ||
      /(?:^|[-_])(?:secret|token|password|credential|api[-_]key)$/u.test(bare)
    ) {
      const flag = entry.split('=')[0];
      throw new CliFailure(
        'secret-in-argv',
        `Refusing ${flag}: secrets travel in the environment or a stdin pipe, never in arguments.`,
        2,
      );
    }
  }
}

const SECRET_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/u;

interface CredentialRefs {
  lines: string[];
  spans: Map<string, { start: number; end: number }>;
  valueRanges: Map<string, { start: number; end: number }>;
  indent: number;
}

function credentialPath(dshHome: string): string {
  return join(dshHome, '.credentials.yaml');
}

function badCredentials(message: string): CliFailure {
  return new CliFailure('bad-credentials', message, 1);
}

function parseCredentialRefs(path: string, text: string): CredentialRefs {
  const invalid = (detail: string): CliFailure =>
    badCredentials(`The credential file ${path} is invalid: ${detail}`);
  try {
    parseCredentialsDocument(text, path);
  } catch {
    throw invalid('the native credential schema rejected this document');
  }
  const document = parseDocument(text, { uniqueKeys: true });
  if (document.errors.length > 0 || !isMap(document.contents))
    throw invalid('expected valid YAML with a mapping root');
  for (const pair of document.contents.items) {
    if (!isScalar(pair.key) || !['version', 'refs', 'records'].includes(String(pair.key.value)))
      throw invalid('unknown top-level key');
  }
  if (document.get('version') !== 1)
    throw invalid('missing or unsupported version (want version: 1)');
  const refs = document.get('refs', true);
  const records = document.get('records', true);
  if (records !== undefined && !(isScalar(records) && records.value === null) && !isMap(records))
    throw invalid('records must be a mapping');
  const valueRanges = new Map<string, { start: number; end: number }>();
  if (refs !== undefined && !(isScalar(refs) && refs.value === null)) {
    if (!isMap(refs)) throw invalid('refs must be a mapping');
    if (refs.flow && refs.items.length > 0)
      throw invalid('nonempty inline refs cannot be line-edited; use a block mapping');
    for (const pair of refs.items) {
      if (
        !isScalar(pair.key) ||
        typeof pair.key.value !== 'string' ||
        !SECRET_NAME_RE.test(pair.key.value) ||
        !isScalar(pair.value) ||
        typeof pair.value.value !== 'string' ||
        pair.value.value.trim().length === 0
      )
        throw invalid('refs require addressable keys and nonempty string values');
      if (!pair.value.range) throw invalid('refs require source-addressable values');
      valueRanges.set(pair.key.value, { start: pair.value.range[0], end: pair.value.range[1] });
    }
  }
  const lines = text.split('\n');
  const tops = new Map<string, number>();
  let section: string | undefined;
  let entry: { name: string; start: number; indent: number } | undefined;
  let refsIndent: number | undefined;
  const spans = new Map<string, { start: number; end: number }>();
  const closeEntry = (end: number): void => {
    if (entry === undefined) return;
    if (spans.has(entry.name)) throw invalid(`duplicate key ${entry.name}`);
    spans.set(entry.name, { start: entry.start, end });
    entry = undefined;
  };
  lines.forEach((line, index) => {
    if (line.trim().length === 0) {
      return;
    }
    const indent = line.length - line.trimStart().length;
    const isComment = line.trimStart().startsWith('#');
    if (entry !== undefined && indent > entry.indent) return;
    closeEntry(index);
    if (isComment) return;
    if (indent === 0) {
      if (line === '---' || line === '...') {
        section = undefined;
        return;
      }
      const top = /^([A-Za-z0-9_-]+):(.*)$/u.exec(line);
      if (top === null || top[1] === undefined) throw invalid(`unexpected line ${index + 1}`);
      const name = top[1];
      if (tops.has(name)) throw invalid(`duplicate key ${name}`);
      tops.set(name, index);
      if (name !== 'version' && name !== 'refs' && name !== 'records') {
        throw invalid(`unknown top-level key ${name}`);
      }
      section = name;
      return;
    }
    if (section !== 'refs') {
      if (section === 'records') return;
      throw invalid(`unexpected line ${index + 1}`);
    }
    const item = /^(\s+)([^:\s][^:]*):(.*)$/u.exec(line);
    if (item === null || item[1] === undefined || item[2] === undefined) {
      throw invalid(`unexpected line ${index + 1} under refs`);
    }
    const name = item[2].trim();
    if (!SECRET_NAME_RE.test(name)) throw invalid(`unaddressable key ${name}`);
    refsIndent ??= item[1].length;
    entry = { name, start: index, indent: item[1].length };
  });
  closeEntry(lines.length);
  const versionRaw = tops.has('version') ? lines[tops.get('version')!] : undefined;
  const versionLine =
    versionRaw === undefined
      ? undefined
      : versionRaw
          .replace(/^version:/u, '')
          .split(/\s+#/u, 1)[0]!
          .trim()
          .replace(/^(['"])(.*)\1$/u, '$2');
  if (versionLine !== '1') throw invalid('missing or unsupported version (want version: 1)');
  return { lines, spans, valueRanges, indent: refsIndent ?? 2 };
}

function renderSecretEntry(name: string, value: string, indent: number): string[] {
  return [`${' '.repeat(indent)}${name}: ${JSON.stringify(value)}`];
}

function credentialWriteMode(path: string): number {
  if (process.platform === 'win32') return 0o600;
  let mode: number;
  try {
    mode = lstatSync(path).mode;
  } catch {
    throw badCredentials(`The credential file ${path} cannot be read.`);
  }
  if ((mode & 0o077) !== 0) {
    throw badCredentials(
      `The credential file ${path} is readable beyond its owner; run chmod 600 ${path}.`,
    );
  }
  return mode & 0o600;
}

function backupCredentialFile(path: string, text: string): void {
  const stamp = new Date().toISOString().replace(/[:.]/gu, '-');
  writeFileSync(`${path}.bak-${stamp}-${randomUUID()}`, text, { mode: 0o600, flag: 'wx' });
}

function writeCredentialFile(path: string, lines: string[], mode: number): void {
  writeFileSync(path, lines.join('\n'), { mode });
  if (process.platform !== 'win32') chmodSync(path, mode);
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function readCredentialStore(path: string):
  | {
      text: string;
      refs: CredentialRefs;
      mode: number;
    }
  | undefined {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    if (isMissingFile(error)) return undefined;
    throw badCredentials('The credential file cannot be read.');
  }
  if (text.trim().length === 0) throw badCredentials('The credential file is empty.');
  const mode = credentialWriteMode(path);
  return { text, refs: parseCredentialRefs(path, text), mode };
}

async function withCredentialWrite<T>(
  path: string,
  operation: () => T,
  allowMissingHome = false,
): Promise<T | undefined> {
  let acquired = false;
  try {
    return await withFileLock(path, () => {
      acquired = true;
      return Promise.resolve(operation());
    });
  } catch (error) {
    if (acquired) throw error;
    if (allowMissingHome && isMissingFile(error)) return undefined;
    throw badCredentials('The credential file could not be locked for writing.');
  }
}

function secretRecord(
  name: string,
  env: NodeJS.ProcessEnv,
  stored: boolean,
): { name: string; configured: boolean; source: string; writable: boolean } {
  const fromEnv = env[name];
  if (fromEnv !== undefined && fromEnv.length > 0) {
    return { name, configured: true, source: 'environment', writable: false };
  }
  if (stored) {
    return { name, configured: true, source: 'file', writable: true };
  }
  return { name, configured: false, source: 'absent', writable: false };
}

export function runSecretList(
  values: CreateValues,
  io: BotCreateCliIo,
): { secrets: Array<{ name: string; configured: boolean; source: string; writable: boolean }> } {
  const dshHome = resolveHome(values, io);
  const store = readCredentialStore(credentialPath(dshHome));
  if (store === undefined) return { secrets: [] };
  return {
    secrets: [...store.refs.spans.keys()].sort().map((name) => secretRecord(name, io.env, true)),
  };
}

export async function runSecretPut(
  name: string,
  values: CreateValues,
  io: BotCreateCliIo,
  readStdin: () => Promise<string>,
): Promise<{ secret: { name: string; configured: boolean; source: string; writable: boolean } }> {
  const rawName = name.trim();
  if (!SECRET_NAME_RE.test(rawName)) {
    throw new CliFailure(
      'invalid-input',
      'secret-put needs an environment-variable-style name.',
      1,
    );
  }
  const value = (await readStdin()).replace(/\r?\n$/u, '');
  if (value.length === 0) {
    throw new CliFailure(
      'invalid-input',
      'secret-put read an empty value; removing a key deletes it, use secret-unset.',
      1,
    );
  }
  const path = credentialPath(resolveHome(values, io));
  await withCredentialWrite(path, () => putSecret(path, rawName, value));
  io.stderr(`tobs: saved secret ${rawName}`);
  return { secret: secretRecord(rawName, io.env, true) };
}

function putSecret(path: string, name: string, value: string): void {
  const store = readCredentialStore(path);
  const original = store?.text;
  const lines = store ? [...store.refs.lines] : ['version: 1', '', 'refs:'];
  if (original !== undefined) backupCredentialFile(path, original);
  const range = store?.refs.valueRanges.get(name);
  let next: string[];
  if (range !== undefined && original !== undefined) {
    const suffix = original.slice(range.end);
    const separator = original.slice(range.start, range.end).endsWith('\n') ? '\n' : '';
    next = (original.slice(0, range.start) + JSON.stringify(value) + separator + suffix).split(
      '\n',
    );
  } else {
    const entry = renderSecretEntry(name, value, store?.refs.indent ?? 2);
    const refsLine = lines.findIndex((line) => /^refs:(.*)$/u.test(line));
    if (refsLine === -1) {
      const tail = lines.length > 0 && lines[lines.length - 1] !== '' ? [''] : [];
      next = [...lines, ...tail, 'refs:', ...entry];
    } else {
      lines[refsLine] = lines[refsLine]!.replace(/^(refs:)\s*\{\s*\}/u, '$1');
      let end = refsLine + 1;
      while (end < lines.length) {
        const line = lines[end]!;
        if (line.trim().length === 0) {
          end += 1;
          continue;
        }
        if (line.length - line.trimStart().length === 0) break;
        end += 1;
      }
      next = [...lines.slice(0, end), ...entry, ...lines.slice(end)];
    }
  }
  if (next.length > 0 && next[next.length - 1] !== '') next.push('');
  parseCredentialRefs(path, next.join('\n'));
  const mode = store?.mode ?? 0o600;
  try {
    writeCredentialFile(path, next, mode);
    const text = readFileSync(path, 'utf8');
    const reread = parseCredentialRefs(path, text);
    if (!reread.spans.has(name) || parseDocument(text).getIn(['refs', name]) !== value)
      throw badCredentials('The secret write did not round-trip.');
  } catch {
    if (original === undefined) {
      try {
        unlinkSync(path);
      } catch (error) {
        if (!isMissingFile(error))
          throw badCredentials('The failed new credential file could not be removed.');
      }
    } else writeFileSync(path, original, { mode });
    throw badCredentials(
      'The secret write failed validation; the previous credential file was restored.',
    );
  }
}

export async function runSecretUnset(
  name: string,
  values: CreateValues,
  io: BotCreateCliIo,
): Promise<{ secret: { name: string; configured: boolean; source: string; writable: boolean } }> {
  const rawName = name.trim();
  if (!SECRET_NAME_RE.test(rawName)) {
    throw new CliFailure(
      'invalid-input',
      'secret-unset needs an environment-variable-style name.',
      1,
    );
  }
  const path = credentialPath(resolveHome(values, io));
  const removed = await withCredentialWrite(path, () => unsetSecret(path, rawName), true);
  if (removed) io.stderr(`tobs: removed secret ${rawName}`);
  return { secret: secretRecord(rawName, io.env, false) };
}

function unsetSecret(path: string, name: string): boolean {
  const store = readCredentialStore(path);
  const span = store?.refs.spans.get(name);
  if (store === undefined || span === undefined) return false;
  const { text, refs, mode } = store;
  const range = refs.valueRanges.get(name);
  if (!range) throw badCredentials('The secret has no editable source range.');
  const entryStart = refs.lines
    .slice(0, span.start)
    .reduce((offset, line) => offset + line.length + 1, 0);
  const next = (text.slice(0, entryStart) + text.slice(range.end)).split('\n');
  backupCredentialFile(path, text);
  parseCredentialRefs(path, next.join('\n'));
  try {
    writeCredentialFile(path, next, mode);
    const reread = parseCredentialRefs(path, readFileSync(path, 'utf8'));
    if (reread.spans.has(name)) throw badCredentials('The secret delete did not round-trip.');
  } catch {
    writeFileSync(path, text, { mode });
    throw badCredentials(
      'The secret delete failed validation; the previous credential file was restored.',
    );
  }
  return true;
}
