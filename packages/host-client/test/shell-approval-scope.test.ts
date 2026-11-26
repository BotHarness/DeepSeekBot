import { describe, expect, it } from 'vitest';
import {
  customShellRule,
  shellPrefixErrorCode,
  shellPrefixHead,
  shellPrefixProblem,
  shellScopeChoices,
  shellScopeDecision,
} from '../src/shared/shell-approval-scope';

describe('shellScopeChoices', () => {
  it('offers the one-word and two-word prefixes of a simple command', () => {
    expect(
      shellScopeChoices({
        exact: 'git status -s',
        compound: false,
        unparseable: false,
        subcommands: [
          { exact: 'git status -s', oneWordPrefix: 'git *', twoWordPrefix: 'git status *' },
        ],
      }),
    ).toEqual([
      { id: 'all' },
      { id: 'one-word', pattern: 'git *' },
      { id: 'two-word', pattern: 'git status *' },
      { id: 'exact' },
      { id: 'custom', drafts: ['git status *'], commands: ['git status -s'] },
    ]);
  });

  it('shows only the prefixes the Host suggests for a runner', () => {
    expect(
      shellScopeChoices({
        exact: 'npx vitest run',
        compound: false,
        unparseable: false,
        subcommands: [{ exact: 'npx vitest run', twoWordPrefix: 'npx vitest *' }],
      }),
    ).toEqual([
      { id: 'all' },
      { id: 'two-word', pattern: 'npx vitest *' },
      { id: 'exact' },
      { id: 'custom', drafts: ['npx vitest *'], commands: ['npx vitest run'] },
    ]);
    expect(
      shellScopeChoices({
        exact: 'bash -c "ls"',
        compound: false,
        unparseable: false,
        subcommands: [{ exact: 'bash -c "ls"' }],
      }),
    ).toEqual([
      { id: 'all' },
      { id: 'exact' },
      { id: 'custom', drafts: [''], commands: ['bash -c "ls"'] },
    ]);
  });

  it('saves the narrowest prefix of every subcommand for a compound command', () => {
    expect(
      shellScopeChoices({
        exact: 'git status && ls -la',
        compound: true,
        unparseable: false,
        subcommands: [
          { exact: 'git status', oneWordPrefix: 'git *', twoWordPrefix: 'git status *' },
          { exact: 'ls -la', oneWordPrefix: 'ls *' },
        ],
      }),
    ).toEqual([
      { id: 'all' },
      { id: 'each-subcommand', patterns: ['git status *', 'ls *'] },
      { id: 'exact' },
      {
        id: 'custom',
        drafts: ['git status *', 'ls *'],
        commands: ['git status', 'ls -la'],
      },
    ]);
  });

  it('leaves out the split choice when a subcommand has no prefix', () => {
    const ids = shellScopeChoices({
      exact: 'git status; sh -c "x"',
      compound: true,
      unparseable: false,
      subcommands: [
        { exact: 'git status', oneWordPrefix: 'git *', twoWordPrefix: 'git status *' },
        { exact: 'sh -c "x"' },
      ],
    }).map((choice) => choice.id);
    expect(ids).toEqual(['all', 'exact', 'custom']);
  });

  it('offers only all and exact for an unparseable command', () => {
    expect(
      shellScopeChoices({
        exact: 'echo $(whoami)',
        compound: false,
        unparseable: true,
        subcommands: [],
      }),
    ).toEqual([{ id: 'all' }, { id: 'exact' }]);
  });
});

describe('shell scope decisions', () => {
  it('maps every menu choice to the Host decide call', () => {
    expect(shellScopeDecision({ id: 'all' })).toEqual({ outcome: 'allowed-always-tool' });
    expect(shellScopeDecision({ id: 'exact' })).toEqual({ outcome: 'allowed-always-exact' });
    expect(shellScopeDecision({ id: 'two-word', pattern: 'git status *' })).toEqual({
      outcome: 'allowed-always-prefix',
      rule: { kind: 'prefix', patterns: ['git status *'] },
    });
    expect(
      shellScopeDecision({ id: 'each-subcommand', patterns: ['git status *', 'ls *'] }),
    ).toEqual({
      outcome: 'allowed-always-prefix',
      rule: { kind: 'prefix', patterns: ['git status *', 'ls *'] },
    });
  });

  it('validates the trailing space and star of a custom prefix', () => {
    expect(shellPrefixProblem('git status *')).toBeUndefined();
    expect(shellPrefixProblem('  git log * ')).toBeUndefined();
    expect(shellPrefixProblem('')).toBe('empty');
    expect(shellPrefixProblem('git status')).toBe('trailing-star');
    expect(shellPrefixProblem('git status*')).toBe('trailing-star');
    expect(shellPrefixProblem('git * status *')).toBe('trailing-star');
    expect(shellPrefixProblem(' *')).toBe('trailing-star');
  });

  it('builds a custom rule and skips blank compound rows', () => {
    expect(customShellRule([' git log * '])).toEqual({
      ok: true,
      rule: { kind: 'prefix', patterns: ['git log *'] },
    });
    expect(customShellRule(['git status *', ''])).toEqual({
      ok: true,
      rule: { kind: 'prefix', patterns: ['git status *'] },
    });
    expect(customShellRule(['', ''])).toEqual({ ok: false, problem: 'empty', index: 0 });
    expect(customShellRule(['git status *', 'ls'])).toEqual({
      ok: false,
      problem: 'trailing-star',
      index: 1,
    });
  });

  it('reads Host prefix error codes through wrapped errors', () => {
    const refused = Object.assign(new Error('runner'), { code: 'unsafe-shell-prefix-runner' });
    expect(shellPrefixErrorCode(refused)).toBe('unsafe-shell-prefix-runner');
    expect(shellPrefixErrorCode(new Error('wrapped', { cause: refused }))).toBe(
      'unsafe-shell-prefix-runner',
    );
    expect(shellPrefixErrorCode(Object.assign(new Error('x'), { code: 'other' }))).toBeUndefined();
    expect(shellPrefixHead('git status *')).toBe('git status');
  });
});
