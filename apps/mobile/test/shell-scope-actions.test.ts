import { describe, expect, it, vi } from 'vitest';

import { shellScopeActions } from '../src/ui/chat/shell-scope-actions';
import { ruleDetail } from '../src/ui/chat/approval-records-text';
import { t } from '../src/ui/strings';

const simple = {
  exact: 'git status -s',
  compound: false,
  unparseable: false,
  subcommands: [{ exact: 'git status -s', oneWordPrefix: 'git *', twoWordPrefix: 'git status *' }],
};

describe('Shell Always allow menu', () => {
  it('lists the prefixes of a simple command and decides with the chosen one', () => {
    const decide = vi.fn();
    const custom = vi.fn();
    const actions = shellScopeActions(simple, 'bash', { decide, custom });
    expect(actions.map((action) => [action.key, action.label])).toEqual([
      ['all', t.shellScope.all('bash')],
      ['one-word', t.shellScope.startsWith('git *')],
      ['two-word', t.shellScope.startsWith('git status *')],
      ['exact', t.shellScope.exact],
      ['custom', t.shellScope.custom],
    ]);
    actions[2]!.run();
    expect(decide).toHaveBeenCalledWith({
      outcome: 'allowed-always-prefix',
      rule: { kind: 'prefix', patterns: ['git status *'] },
    });
    actions[0]!.run();
    expect(decide).toHaveBeenLastCalledWith({ outcome: 'allowed-always-tool' });
    actions[3]!.run();
    expect(decide).toHaveBeenLastCalledWith({ outcome: 'allowed-always-exact' });
    actions[4]!.run();
    expect(custom).toHaveBeenCalledWith({
      id: 'custom',
      drafts: ['git status *'],
      commands: ['git status -s'],
    });
  });

  it('offers one rule per subcommand for a compound command', () => {
    const decide = vi.fn();
    const actions = shellScopeActions(
      {
        exact: 'git status && ls -la',
        compound: true,
        unparseable: false,
        subcommands: [
          { exact: 'git status', oneWordPrefix: 'git *', twoWordPrefix: 'git status *' },
          { exact: 'ls -la', oneWordPrefix: 'ls *' },
        ],
      },
      'bash',
      { decide, custom: vi.fn() },
    );
    expect(actions.map((action) => action.key)).toEqual([
      'all',
      'each-subcommand',
      'exact',
      'custom',
    ]);
    expect(actions[1]!.label).toBe(t.shellScope.each(['git status *', 'ls *']));
    actions[1]!.run();
    expect(decide).toHaveBeenCalledWith({
      outcome: 'allowed-always-prefix',
      rule: { kind: 'prefix', patterns: ['git status *', 'ls *'] },
    });
  });

  it('offers only all and exact for an unparseable or runner-only command', () => {
    const handlers = { decide: vi.fn(), custom: vi.fn() };
    expect(
      shellScopeActions(
        { exact: 'echo $(id)', compound: false, unparseable: true, subcommands: [] },
        'bash',
        handlers,
      ).map((action) => action.key),
    ).toEqual(['all', 'exact']);
    expect(
      shellScopeActions(
        {
          exact: 'sh -c x',
          compound: false,
          unparseable: false,
          subcommands: [{ exact: 'sh -c x' }],
        },
        'bash',
        handlers,
      ).map((action) => action.key),
    ).toEqual(['all', 'exact', 'custom']);
    expect(shellScopeActions(undefined, 'bash', handlers)).toEqual([]);
  });

  it('reads a saved prefix rule as its prefix', () => {
    expect(
      ruleDetail({
        id: 'r',
        role: 'orchestrator',
        kind: 'prefix',
        toolName: 'bash',
        input: 'git status *',
        createdAt: '2026-11-27T00:00:00.000Z',
        external: false,
      }).split('\n')[0],
    ).toBe(t.approvals.startsWith('git status'));
  });
});
