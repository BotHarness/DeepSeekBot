import type {
  ShellPrefixApproval,
  WireShellApprovalSuggestions,
} from '@botharness/host-protocol/wire';

export type ShellScopeChoice =
  | { id: 'all' }
  | { id: 'one-word' | 'two-word'; pattern: string }
  | { id: 'each-subcommand'; patterns: string[] }
  | { id: 'exact' }
  | { id: 'custom'; drafts: string[]; commands: string[] };

export type ShellScopeDecision =
  | { outcome: 'allowed-always-tool' | 'allowed-always-exact' }
  | { outcome: 'allowed-always-prefix'; rule: ShellPrefixApproval };

export type ShellPrefixProblem = 'empty' | 'trailing-star';

export type ShellPrefixErrorCode =
  | 'invalid-shell-prefix'
  | 'unsafe-shell-prefix-runner'
  | 'shell-prefix-mismatch';

const ERROR_CODES: ReadonlySet<string> = new Set<ShellPrefixErrorCode>([
  'invalid-shell-prefix',
  'unsafe-shell-prefix-runner',
  'shell-prefix-mismatch',
]);

export const SHELL_PREFIX_SUFFIX = ' *';

export function shellScopeTool(toolName: string): boolean {
  return toolName === 'bash' || toolName === 'shell';
}

export function shellScopeChoices(suggestions: WireShellApprovalSuggestions): ShellScopeChoice[] {
  const parts = suggestions.subcommands;
  if (suggestions.unparseable || parts.length === 0) return [{ id: 'all' }, { id: 'exact' }];
  const narrowest = parts.map((part) => part.twoWordPrefix ?? part.oneWordPrefix);
  const choices: ShellScopeChoice[] = [{ id: 'all' }];
  if (!suggestions.compound) {
    const part = parts[0]!;
    if (part.oneWordPrefix !== undefined)
      choices.push({ id: 'one-word', pattern: part.oneWordPrefix });
    if (part.twoWordPrefix !== undefined)
      choices.push({ id: 'two-word', pattern: part.twoWordPrefix });
  } else if (narrowest.every((pattern) => pattern !== undefined)) {
    choices.push({ id: 'each-subcommand', patterns: narrowest });
  }
  choices.push(
    { id: 'exact' },
    {
      id: 'custom',
      drafts: narrowest.map((pattern) => pattern ?? ''),
      commands: parts.map((part) => part.exact),
    },
  );
  return choices;
}

export function shellPrefixHead(pattern: string): string {
  return pattern.endsWith(SHELL_PREFIX_SUFFIX)
    ? pattern.slice(0, -SHELL_PREFIX_SUFFIX.length)
    : pattern;
}

export function shellPrefixProblem(draft: string): ShellPrefixProblem | undefined {
  const value = draft.trim();
  if (value === '') return 'empty';
  if (
    !value.endsWith(SHELL_PREFIX_SUFFIX) ||
    value.indexOf('*') !== value.length - 1 ||
    value.slice(0, -SHELL_PREFIX_SUFFIX.length).trim() === ''
  )
    return 'trailing-star';
  return undefined;
}

export function customShellRule(
  drafts: readonly string[],
):
  | { ok: true; rule: ShellPrefixApproval }
  | { ok: false; problem: ShellPrefixProblem; index: number } {
  const patterns: string[] = [];
  let firstEmpty: number | undefined;
  for (const [index, draft] of drafts.entries()) {
    const problem = shellPrefixProblem(draft);
    if (problem === 'empty' && drafts.length > 1) {
      firstEmpty ??= index;
      continue;
    }
    if (problem !== undefined) return { ok: false, problem, index };
    patterns.push(draft.trim());
  }
  if (patterns.length === 0) return { ok: false, problem: 'empty', index: firstEmpty ?? 0 };
  return { ok: true, rule: { kind: 'prefix', patterns } };
}

export function shellScopeDecision(
  choice: Exclude<ShellScopeChoice, { id: 'custom' }>,
): ShellScopeDecision {
  switch (choice.id) {
    case 'all':
      return { outcome: 'allowed-always-tool' };
    case 'exact':
      return { outcome: 'allowed-always-exact' };
    case 'one-word':
    case 'two-word':
      return {
        outcome: 'allowed-always-prefix',
        rule: { kind: 'prefix', patterns: [choice.pattern] },
      };
    case 'each-subcommand':
      return {
        outcome: 'allowed-always-prefix',
        rule: { kind: 'prefix', patterns: [...choice.patterns] },
      };
  }
}

export function shellPrefixErrorCode(error: unknown): ShellPrefixErrorCode | undefined {
  for (let cause: unknown = error, depth = 0; depth < 3; depth++) {
    if (typeof cause !== 'object' || cause === null) return undefined;
    const code: unknown = 'code' in cause ? cause.code : undefined;
    if (typeof code === 'string' && ERROR_CODES.has(code)) return code as ShellPrefixErrorCode;
    cause = 'cause' in cause ? cause.cause : undefined;
  }
  return undefined;
}
