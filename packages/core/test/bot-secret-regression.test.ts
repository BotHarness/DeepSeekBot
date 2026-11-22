import { chmodSync, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setImmediate } from 'node:timers/promises';
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseDocument } from 'yaml';
import { runBotCreateCli } from '../src/bots/bot-create-cli.js';
import { createTempRoot } from './helpers.js';

const fault = vi.hoisted(() => ({ path: '', failReread: false, written: false, readOnly: false }));
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    lstatSync: (path: string) => {
      const stat = actual.lstatSync(path);
      if (path === fault.path && fault.readOnly) stat.mode &= ~0o200;
      return stat;
    },
    readFileSync: (...args: Parameters<typeof actual.readFileSync>) => {
      if (String(args[0]) === fault.path && fault.failReread && fault.written) {
        fault.failReread = false;
        throw new Error('injected read failure');
      }
      return Reflect.apply(actual.readFileSync, actual, args);
    },
    writeFileSync: (...args: Parameters<typeof actual.writeFileSync>) => {
      Reflect.apply(actual.writeFileSync, actual, args);
      if (String(args[0]) === fault.path) fault.written = true;
    },
  };
});
afterEach(() => {
  fault.path = '';
  fault.failReread = false;
  fault.written = false;
  fault.readOnly = false;
});

async function invoke(home: string, args: string[], stdin = '') {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await runBotCreateCli(['--home', home, ...args], {
    env: {},
    stdout: (text) => stdout.push(text),
    stderr: (text) => stderr.push(text),
    readStdin: async () => stdin,
  });
  return { code, json: JSON.parse(stdout.join('')), output: stdout.join('') + stderr.join('') };
}
function seed(home: string, text: string) {
  const path = join(home, '.credentials.yaml');
  writeFileSync(path, text, { mode: 0o600 });
  if (process.platform !== 'win32') chmodSync(path, 0o600);
  return path;
}

describe('credential YAML regression coverage', () => {
  it.each([
    'records: []',
    'records:\n  invalid: {kind: grant, payload: {}}',
    'records:\n  owner/id: {kind: grant}',
    'records:\n  owner/id: {kind: grant, payload: .inf}',
    'records:\n  owner/id: {kind: api-key, env: {BAD: 4}}',
  ])('refuses native-invalid records unchanged', async (records) => {
    const home = createTempRoot();
    const original = 'version: 1\nrefs: {}\n' + records + '\n';
    const path = seed(home, original);
    const result = await invoke(home, ['secret-put', 'QA_VALUE'], 'private-value');
    expect(result.json.error.code).toBe('bad-credentials');
    expect(result.output).not.toContain('private-value');
    expect(readFileSync(path, 'utf8')).toBe(original);
  });
  it('removes a legacy block scalar without retaining lines that resemble comments', async () => {
    const home = createTempRoot();
    const path = seed(
      home,
      'version: 1\nrefs:\n  QA_VALUE: |-\n    first\n\n    # private-value-line\n  QA_OTHER: retain\n',
    );
    expect((await invoke(home, ['secret-put', 'QA_VALUE'], 'new-value')).code).toBe(0);
    expect(readFileSync(path, 'utf8')).not.toContain('private-value-line');
    expect((await invoke(home, ['secret-unset', 'QA_VALUE'])).code).toBe(0);
    expect(parseDocument(readFileSync(path, 'utf8')).getIn(['refs', 'QA_OTHER'])).toBe('retain');
  });
  it.each(['secret-put', 'secret-unset'])(
    'preserves unrelated separators and comments during %s',
    async (command) => {
      const home = createTempRoot();
      const path = seed(
        home,
        'version: 1\nrefs:\n  QA_VALUE: old # inline note\n\n    # retain this human note\n  QA_OTHER: retain\nrecords: {}\n',
      );
      expect((await invoke(home, [command, 'QA_VALUE'], 'replacement')).code).toBe(0);
      const text = readFileSync(path, 'utf8');
      expect(text).toContain(
        ' # inline note\n\n    # retain this human note\n  QA_OTHER: retain\nrecords: {}\n',
      );
      expect(parseDocument(text).errors).toEqual([]);
    },
  );
  it('normalizes an empty inline refs map and round-trips blank and trailing lines', async () => {
    const home = createTempRoot();
    const path = seed(home, 'version: 1\nrefs: {} # keep this note\nrecords: {}\n');
    const value = 'first\n\nlast\n';
    expect((await invoke(home, ['secret-put', 'QA_VALUE'], value + '\n')).code).toBe(0);
    const text = readFileSync(path, 'utf8');
    expect(text).toContain('# keep this note');
    const parsed = parseDocument(text);
    expect(parsed.errors).toEqual([]);
    expect(parsed.getIn(['refs', 'QA_VALUE'])).toBe(value);
    expect((await invoke(home, ['secret-put', 'QA_VALUE'], 'replacement')).code).toBe(0);
    expect((await invoke(home, ['secret-unset', 'QA_VALUE'])).code).toBe(0);
    expect(parseDocument(readFileSync(path, 'utf8')).getIn(['refs', 'QA_VALUE'])).toBeUndefined();
  });

  it('appends a secret using the existing refs indentation', async () => {
    const home = createTempRoot();
    const original = 'version: 1\nrefs:\n    QA_OLD: old # retain\nrecords: {}\n';
    const path = seed(home, original);

    const result = await invoke(home, ['secret-put', 'QA_NEW'], 'replacement');

    expect(result.code).toBe(0);
    const text = readFileSync(path, 'utf8');
    expect(text).toBe(original.replace('records:', '    QA_NEW: "replacement"\nrecords:'));
    expect(parseDocument(text).getIn(['refs', 'QA_NEW'])).toBe('replacement');
  });

  it('preserves a read-only mode when the writer can update the file', async () => {
    const home = createTempRoot();
    const path = seed(home, 'version: 1\nrefs:\n  QA_VALUE: original\n');
    fault.path = path;
    fault.readOnly = true;

    expect((await invoke(home, ['secret-put', 'QA_VALUE'], 'replacement')).code).toBe(0);

    if (process.platform !== 'win32') expect(statSync(path).mode & 0o777).toBe(0o400);
  });

  it.each(['secret-put', 'secret-unset'])(
    'preserves a concurrent native credential update during %s',
    async (command) => {
      const home = createTempRoot();
      const original = 'version: 1\nrefs:\n  QA_CLI: original\n';
      const path = seed(home, original);
      let mutation: ReturnType<typeof invoke> | undefined;
      await withFileLock(path, async () => {
        const snapshot = readFileSync(path, 'utf8');
        mutation = invoke(home, [command, 'QA_CLI'], 'replacement');
        await setImmediate();
        await writeFileAtomic(path, snapshot + '  QA_NATIVE: retained\n', { mode: 0o600 });
      });

      expect(await mutation).toMatchObject({ code: 0 });
      const document = parseDocument(readFileSync(path, 'utf8'));
      expect(document.getIn(['refs', 'QA_NATIVE'])).toBe('retained');
      expect(document.getIn(['refs', 'QA_CLI'])).toBe(
        command === 'secret-put' ? 'replacement' : undefined,
      );
      expect(existsSync(path + '.lock')).toBe(false);
    },
  );

  it.each(['version: 1\nrefs:\n  QA_NULL:\n', 'version: 1\nrefs: {QA_OLD: old}\n', ''])(
    'refuses unsupported or invalid YAML unchanged',
    async (original) => {
      const home = createTempRoot();
      const path = seed(home, original);
      const result = await invoke(home, ['secret-put', 'QA_VALUE'], 'new-private-value');
      expect(result.json.error.code).toBe('bad-credentials');
      expect(result.output).not.toContain('new-private-value');
      expect(readFileSync(path, 'utf8')).toBe(original);
    },
  );

  it.each(['--feishu-secret', '--oauth-token'])(
    'refuses a secret-bearing flag %s without echoing it',
    async (flag) => {
      const result = await invoke(createTempRoot(), ['secret-list', flag, 'private-argv-value']);
      expect(result.json.error.code).toBe('secret-in-argv');
      expect(result.output).not.toContain('private-argv-value');
    },
  );
  it('refuses a positional secret value without echoing it', async () => {
    const result = await invoke(createTempRoot(), ['secret-put', 'QA_VALUE', 'private-argv-value']);
    expect(result.json.error.code).toBe('secret-in-argv');
    expect(result.output).not.toContain('private-argv-value');
  });

  it.each(['secret-put', 'secret-unset'])(
    'restores exact previous bytes when %s disk revalidation fails',
    async (command) => {
      const home = createTempRoot();
      const original = 'version: 1\n# retain me\nrefs:\n  QA_VALUE: old\nrecords: {}\n';
      const path = seed(home, original);
      fault.path = path;
      fault.failReread = true;
      const result = await invoke(home, [command, 'QA_VALUE'], 'new-private-value');
      expect(result.json.error.code).toBe('bad-credentials');
      expect(readFileSync(path, 'utf8')).toBe(original);
      expect(result.output).not.toContain('new-private-value');
    },
  );
  it('removes a newly created store when disk revalidation fails', async () => {
    const home = createTempRoot();
    const path = join(home, '.credentials.yaml');
    fault.path = path;
    fault.failReread = true;
    const result = await invoke(home, ['secret-put', 'QA_VALUE'], 'new-private-value');
    expect(result.json.error.code).toBe('bad-credentials');
    expect(existsSync(path)).toBe(false);
  });
});
