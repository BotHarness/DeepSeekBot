import * as stylex from '@stylexjs/stylex';
import {
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type TouchEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import type { WireShellApprovalSuggestions } from '@botharness/host-protocol/wire';
import {
  customShellRule,
  shellPrefixErrorCode,
  shellScopeChoices,
  shellScopeDecision,
  type ShellPrefixErrorCode,
  type ShellPrefixProblem,
  type ShellScopeChoice,
  type ShellScopeDecision,
} from '@botharness/host-client/shared/shell-approval-scope';
import { errorMessage } from './bridge.js';
import { FormDialog } from './ds/form-dialog.js';
import { FieldStack, TextField } from './ds/field.js';
import { Menu, type MenuEntry } from './ds/menu.js';
import { font, ink, space } from './ds/tobs.stylex.js';
import type { BotHarnessTranslate } from './locale.js';

export const SHELL_SCOPE_LONG_PRESS_MS = 500;
const LONG_PRESS_TOLERANCE_PX = 10;

const styles = stylex.create({
  code: { fontFamily: font.familyMono },
  choice: { display: 'flex', flexDirection: 'column', minWidth: 0 },
  patterns: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x1,
    color: ink.tertiary,
    fontFamily: font.familyMono,
  },
  pattern: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
});

type Point = { x: number; y: number };

export type ShellScopeDecide = (
  decision: ShellScopeDecision,
  report?: (cause: unknown) => void,
) => void;

const PROBLEM_KEYS = {
  empty: 'approval.scope.empty',
  'trailing-star': 'approval.scope.trailingStar',
} as const satisfies Record<ShellPrefixProblem, string>;

const ERROR_KEYS = {
  'invalid-shell-prefix': 'approval.scope.invalid',
  'unsafe-shell-prefix-runner': 'approval.scope.unsafeRunner',
  'shell-prefix-mismatch': 'approval.scope.mismatch',
} as const satisfies Record<ShellPrefixErrorCode, string>;

export function shellScopeErrorText(cause: unknown, t: BotHarnessTranslate): string {
  const code = shellPrefixErrorCode(cause);
  return code === undefined ? errorMessage(cause) : t(ERROR_KEYS[code]);
}

function startsWith(pattern: string, t: BotHarnessTranslate): ReactNode {
  const marker = '\u0000';
  const [before = '', after = ''] = t('approval.scope.startsWith', { prefix: marker }).split(
    marker,
  );
  return (
    <>
      {before}
      <code {...stylex.props(styles.code)}>{pattern}</code>
      {after}
    </>
  );
}

export function shellScopeMenuEntries(
  choices: readonly ShellScopeChoice[],
  toolName: string,
  t: BotHarnessTranslate,
): MenuEntry[] {
  const entries: MenuEntry[] = [{ type: 'label', id: 'heading', text: t('approval.scope.title') }];
  for (const choice of choices) {
    if (choice.id === 'all')
      entries.push({ id: choice.id, label: t('approval.scope.all', { tool: toolName }) });
    else if (choice.id === 'one-word' || choice.id === 'two-word')
      entries.push({ id: choice.id, label: startsWith(choice.pattern, t) });
    else if (choice.id === 'each-subcommand')
      entries.push({
        id: choice.id,
        label: (
          <span {...stylex.props(styles.choice)}>
            <span>{t('approval.scope.each')}</span>
            <span {...stylex.props(styles.patterns)}>
              {choice.patterns.map((pattern, index) => (
                <span key={index} {...stylex.props(styles.pattern)}>
                  {pattern}
                </span>
              ))}
            </span>
          </span>
        ),
      });
    else if (choice.id === 'exact')
      entries.push({ id: choice.id, label: t('approval.scope.exact') });
    else
      entries.push(
        { type: 'separator', id: 'custom-separator' },
        { id: choice.id, label: t('approval.scope.custom') },
      );
  }
  return entries;
}

function CustomShellScopeDialog({
  choice,
  t,
  busy,
  onDecide,
  onClose,
}: {
  choice: Extract<ShellScopeChoice, { id: 'custom' }>;
  t: BotHarnessTranslate;
  busy: boolean;
  onDecide: ShellScopeDecide;
  onClose: () => void;
}): ReactElement {
  const [drafts, setDrafts] = useState(choice.drafts);
  const [problem, setProblem] = useState<{ index: number; text: string }>();
  const [hostError, setHostError] = useState<string>();
  const compound = choice.drafts.length > 1;
  const submit = (): void => {
    const result = customShellRule(drafts);
    if (!result.ok) {
      setProblem({ index: result.index, text: t(PROBLEM_KEYS[result.problem]) });
      return;
    }
    setProblem(undefined);
    setHostError(undefined);
    onDecide({ outcome: 'allowed-always-prefix', rule: result.rule }, (cause) =>
      setHostError(shellScopeErrorText(cause, t)),
    );
  };
  return (
    <FormDialog
      title={t('approval.scope.customTitle')}
      labels={{ close: t('common.close'), cancel: t('approval.cancel') }}
      submitLabel={t('approval.scope.customSave')}
      busy={busy}
      error={hostError}
      onCancel={onClose}
      onSubmit={submit}
      submitData={{ 'data-shell-scope-save': '' }}
    >
      <FieldStack>
        {drafts.map((draft, index) => (
          <TextField
            key={index}
            label={
              compound ? (
                <code {...stylex.props(styles.code)}>{choice.commands[index]}</code>
              ) : (
                t('approval.scope.customLabel')
              )
            }
            hint={index === drafts.length - 1 ? t('approval.scope.customHint') : undefined}
            error={problem?.index === index ? problem.text : undefined}
            value={draft}
            monospace
            initialFocus={index === 0}
            selectOnFocus={index === 0}
            onChange={(value) => {
              setDrafts((current) => current.map((item, at) => (at === index ? value : item)));
              if (problem?.index === index) setProblem(undefined);
              setHostError(undefined);
            }}
          />
        ))}
      </FieldStack>
    </FormDialog>
  );
}

export interface ShellScopeTriggerProps {
  onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLButtonElement>) => void;
  onPointerUp: () => void;
  onPointerLeave: () => void;
  onPointerCancel: () => void;
  onContextMenu: (event: MouseEvent<HTMLButtonElement>) => void;
  onTouchStart: (event: TouchEvent<HTMLButtonElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  'aria-keyshortcuts': string;
}

export function useShellScopeMenu({
  suggestions,
  toolName,
  enabled,
  busy,
  t,
  onDecide,
}: {
  suggestions: WireShellApprovalSuggestions | undefined;
  toolName: string;
  enabled: boolean;
  busy: boolean;
  t: BotHarnessTranslate;
  onDecide: ShellScopeDecide;
}): {
  trigger: ShellScopeTriggerProps | undefined;
  consumeClick: () => boolean;
  overlay: ReactElement | null;
} {
  const [menu, setMenu] = useState<{ point: Point; keyboard: boolean }>();
  const [custom, setCustom] = useState<Extract<ShellScopeChoice, { id: 'custom' }>>();
  const press = useRef<{ timer: number; start: Point } | undefined>(undefined);
  const fired = useRef(false);
  const button = useRef<HTMLButtonElement | null>(null);
  const active = enabled && suggestions !== undefined;
  const choices = suggestions === undefined ? [] : shellScopeChoices(suggestions);
  const cancelPress = (): void => {
    if (press.current !== undefined) window.clearTimeout(press.current.timer);
    press.current = undefined;
  };
  const open = (point: Point, keyboard: boolean): void => {
    cancelPress();
    setMenu({ point, keyboard });
  };
  const trigger: ShellScopeTriggerProps | undefined = !active
    ? undefined
    : {
        onPointerDown: (event) => {
          if (event.button !== 0 || event.currentTarget.disabled) return;
          button.current = event.currentTarget;
          fired.current = false;
          cancelPress();
          const start = { x: event.clientX, y: event.clientY };
          press.current = {
            start,
            timer: window.setTimeout(() => {
              fired.current = true;
              open(start, false);
            }, SHELL_SCOPE_LONG_PRESS_MS),
          };
        },
        onPointerMove: (event) => {
          const start = press.current?.start;
          if (
            start !== undefined &&
            (Math.abs(event.clientX - start.x) > LONG_PRESS_TOLERANCE_PX ||
              Math.abs(event.clientY - start.y) > LONG_PRESS_TOLERANCE_PX)
          )
            cancelPress();
        },
        onPointerUp: cancelPress,
        onPointerLeave: cancelPress,
        onPointerCancel: cancelPress,
        onContextMenu: (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (event.currentTarget.disabled) return;
          button.current = event.currentTarget;
          open({ x: event.clientX, y: event.clientY }, false);
        },
        onTouchStart: (event) => event.stopPropagation(),
        onKeyDown: (event) => {
          if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
          event.preventDefault();
          event.stopPropagation();
          button.current = event.currentTarget;
          const rect = event.currentTarget.getBoundingClientRect();
          open({ x: rect.left, y: rect.bottom }, true);
        },
        'aria-keyshortcuts': 'Shift+F10',
      };
  const consumeClick = (): boolean => {
    if (!fired.current) return false;
    fired.current = false;
    return true;
  };
  const close = (): void => setMenu(undefined);
  const overlay = !active ? null : (
    <>
      {menu === undefined ? null : (
        <Menu
          open
          portal
          point={menu.point}
          anchor={null}
          autoFocus={menu.keyboard}
          returnFocus={() => button.current}
          items={shellScopeMenuEntries(choices, toolName, t)}
          onSelect={(id) => {
            close();
            const choice = choices.find((item) => item.id === id);
            if (choice === undefined) return;
            if (choice.id === 'custom') setCustom(choice);
            else onDecide(shellScopeDecision(choice));
          }}
          onClose={close}
        />
      )}
      {custom === undefined ? null : (
        <CustomShellScopeDialog
          choice={custom}
          t={t}
          busy={busy}
          onDecide={onDecide}
          onClose={() => setCustom(undefined)}
        />
      )}
    </>
  );
  return { trigger, consumeClick, overlay };
}
