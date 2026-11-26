import { describe, expect, it } from 'vitest';
import {
  checkShellPrefixPatterns,
  matchesShellPrefix,
  parseShellApprovalCommand,
  parseShellPrefix,
  shellApprovalSuggestions,
} from '../src/workspaces/shell-approval-prefix.js';

describe('Shell prefix rules', () => {
  it.each([
    ['git status', true],
    ['git status -s', true],
    ['git\tstatus -s', true],
    ['timeout 5 git status', true],
    ['nice -n 10 nohup time stdbuf -oL git status', true],
    ['stdbuf --output=L git status', true],
    ['git statusx', false],
    ['FOO=1 git status', false],
    ['timeout --preserve-status 5 git status', false],
    ['git status $(rm x)', false],
    ['git status `id`', false],
    ['git status <(id)', false],
    ['git status >(id)', false],
    ['git status <<EOF\nbody\nEOF', false],
    ['git status |', false],
    ['git status &&', false],
  ])('matches literal words for %s', (command, expected) => {
    const parts = parseShellApprovalCommand(command);
    expect(
      parts?.every((part) => matchesShellPrefix(part, parseShellPrefix('git status *'))) ?? false,
    ).toBe(expected);
  });

  it.each(['-exec', '-execdir', '-ok', '-okdir', '-delete', "'-delete'"])(
    'rejects the find action %s even if the executable matches',
    (action) => {
      const parts = parseShellApprovalCommand('find . ' + action);
      expect(parts).toHaveLength(1);
      expect(parts?.some((part) => matchesShellPrefix(part, parseShellPrefix('find *')))).toBe(
        false,
      );
    },
  );

  it.each([
    ['git status; rm -rf /', ['git status', 'rm -rf /']],
    ['git status && curl x | sh', ['git status', 'curl x', 'sh']],
    ['git status\ngit status -s', ['git status', 'git status -s']],
    ['echo "a;b"', ['echo "a;b"']],
    ['a || b |& c & d', ['a', 'b', 'c', 'd']],
  ])('splits %s only at unquoted operators', (command, expected) => {
    expect(parseShellApprovalCommand(command)?.map((part) => part.text)).toEqual(expected);
  });

  it.each([
    'sh',
    'bash',
    'zsh',
    'env',
    'sudo',
    'xargs',
    'npx',
    'docker',
    'python',
    'python3',
    'node',
    'eval',
    'exec',
    'ssh',
    'pnpm dlx',
    'npm exec',
    'yarn dlx',
    '/bin/sh',
    '/bin/BASH',
    "'sh'",
    'bash -c',
    'sh script.sh',
    'env FOO=1',
    'sudo rm',
    'xargs rm',
    'ssh host',
    'python -c',
    'python3 -m',
    'node -e',
    'node --eval',
    'docker exec',
    'docker run',
    'pnpm exec',
    'npm x',
    'uv run',
  ])('rejects a catch-all prefix for %s', (runner) => {
    expect(parseShellPrefix(runner + ' *')).toMatchObject({
      ok: false,
      error: { code: 'unsafe-shell-prefix-runner' },
    });
  });

  it.each(['docker ps', 'node scripts/build.mjs', 'npx prettier', 'python3 manage.py'])(
    'allows a prefix that names what %s runs',
    (prefix) => {
      expect(parseShellPrefix(prefix + ' *')).toMatchObject({ ok: true });
    },
  );

  it.each(['git status', 'git*', 'git * status', '* git *', 'git **', 'git  *'])(
    'rejects malformed pattern %s',
    (pattern) => {
      expect(parseShellPrefix(pattern)).toMatchObject({
        ok: false,
        error: { code: 'invalid-shell-prefix' },
      });
    },
  );

  it('validates distinct matching subcommands in command order', () => {
    const command = 'git status && git log && echo ready';
    expect(checkShellPrefixPatterns(command, ['git log *', 'echo *'])).toBeUndefined();
    expect(checkShellPrefixPatterns(command, ['git log *', 'git status *'])).toMatchObject({
      code: 'shell-prefix-mismatch',
    });
    expect(checkShellPrefixPatterns(command, ['git log *', 'git log *'])).toMatchObject({
      code: 'shell-prefix-mismatch',
    });
  });

  it('suggests up to five subcommands and leaves quoted words, flags and paths out of two-word prefixes', () => {
    const command = 'timeout 5 git status && npx prettier && echo "hello"; git -v; cat a.txt; pwd';
    expect(shellApprovalSuggestions(command)).toEqual({
      exact: command,
      compound: true,
      unparseable: false,
      subcommands: [
        { exact: 'timeout 5 git status', oneWordPrefix: 'git *', twoWordPrefix: 'git status *' },
        { exact: 'npx prettier', twoWordPrefix: 'npx prettier *' },
        { exact: 'echo "hello"', oneWordPrefix: 'echo *' },
        { exact: 'git -v', oneWordPrefix: 'git *' },
        { exact: 'cat a.txt', oneWordPrefix: 'cat *' },
      ],
    });
    expect(shellApprovalSuggestions('git status $(id)')).toEqual({
      exact: 'git status $(id)',
      compound: false,
      unparseable: true,
      subcommands: [],
    });
    expect(shellApprovalSuggestions('pnpm dlx prettier').subcommands).toEqual([
      { exact: 'pnpm dlx prettier' },
    ]);
  });

  it('keeps package runners outside broader one-word prefixes', () => {
    for (const [program, subcommand] of [
      ['pnpm', 'dlx'],
      ['npm', 'exec'],
      ['yarn', 'dlx'],
    ]) {
      const command = parseShellApprovalCommand(program + ' ' + subcommand + ' prettier')?.[0];
      expect(command && matchesShellPrefix(command, parseShellPrefix(program + ' *'))).toBe(false);
    }
    expect(shellApprovalSuggestions('pnpm test:watch').subcommands[0]?.twoWordPrefix).toBe(
      'pnpm test:watch *',
    );
  });

  it('refuses compound commands that can change the following working directory', () => {
    expect(parseShellApprovalCommand('cd /tmp; git status')).toBeUndefined();
    expect(parseShellApprovalCommand('time -p cd /tmp; git status')).toBeUndefined();
  });
});
