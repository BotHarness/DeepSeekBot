import type { WireShellApprovalSuggestions } from '@botharness/host-protocol/wire';
import {
  shellPrefixErrorCode,
  shellScopeChoices,
  shellScopeDecision,
  type ShellPrefixProblem,
  type ShellScopeChoice,
  type ShellScopeDecision,
} from '@botharness/host-client/shared/shell-approval-scope';
import type { ContextAction } from '../primitives/context-menu';
import { t } from '../strings';

export type CustomShellScope = Extract<ShellScopeChoice, { id: 'custom' }>;

export function shellScopeActions(
  suggestions: WireShellApprovalSuggestions | undefined,
  toolName: string,
  handlers: { decide(decision: ShellScopeDecision): void; custom(choice: CustomShellScope): void },
): ContextAction[] {
  if (suggestions === undefined) return [];
  const copy = t.shellScope;
  return shellScopeChoices(suggestions).map((choice): ContextAction => {
    if (choice.id === 'custom')
      return { key: choice.id, label: copy.custom, run: () => handlers.custom(choice) };
    const label =
      choice.id === 'all'
        ? copy.all(toolName)
        : choice.id === 'exact'
          ? copy.exact
          : choice.id === 'each-subcommand'
            ? copy.each(choice.patterns)
            : copy.startsWith(choice.pattern);
    return { key: choice.id, label, run: () => handlers.decide(shellScopeDecision(choice)) };
  });
}

export function shellScopeProblemText(problem: ShellPrefixProblem): string {
  return problem === 'empty' ? t.shellScope.empty : t.shellScope.trailingStar;
}

export function shellScopeErrorText(error: unknown): string | undefined {
  const code = shellPrefixErrorCode(error);
  return code === undefined
    ? undefined
    : code === 'unsafe-shell-prefix-runner'
      ? t.shellScope.unsafeRunner
      : code === 'shell-prefix-mismatch'
        ? t.shellScope.mismatch
        : t.shellScope.invalid;
}
