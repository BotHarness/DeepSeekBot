import { useLayoutEffect, useRef, useSyncExternalStore, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';

import { Button } from '@deepseek-ai/dsh-client-ui-primitives';

import type { UpdateRun } from '../../../core/src/release/update-runs.js';
import { StepProgress } from './ds/step-progress.js';
import { border, color, radius, space, text } from './ds/tokens.stylex.js';
import type { BotHarnessKey, BotHarnessTranslate } from './locale.js';
import { failureReason } from './release-notes-view.js';
import {
  updateRunActive,
  type UpdateRunKind,
  type UpdateRunsController,
  type UpdateRunsSnapshot,
} from './update-runs.js';

const styles = stylex.create({
  panel: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x3,
    minWidth: 0,
    padding: space.x4,
    borderWidth: border.hairline,
    borderStyle: 'solid',
    borderColor: color.border,
    borderRadius: radius.md,
    backgroundColor: color.modal,
    color: color.fg,
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
  },
  head: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x3,
    minWidth: 0,
  },
  title: {
    flexGrow: 1,
    minWidth: 0,
    margin: 0,
    fontSize: text.titleSize,
    lineHeight: text.titleLine,
    fontWeight: text.strong,
    overflowWrap: 'anywhere',
  },
  status: { margin: 0, color: color.muted, overflowWrap: 'anywhere' },
  failed: { color: color.danger },
  done: { color: color.success },
  note: { margin: 0, color: color.muted, fontSize: text.metaSize, lineHeight: text.metaLine },
  logLabel: {
    margin: 0,
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    fontWeight: text.strong,
  },
  log: {
    maxHeight: 220,
    margin: 0,
    overflow: 'auto',
    padding: `${space.x3} ${space.x4}`,
    borderRadius: radius.sm,
    backgroundColor: color.surface,
    color: color.muted,
    fontFamily: 'var(--dsw-font-family-mono, ui-monospace, monospace)',
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
  },
  command: { color: color.fg, fontWeight: text.strong },
  exitOk: { color: color.success },
  exitBad: { color: color.danger },
});

const STEP_KEYS: readonly BotHarnessKey[] = [
  'update.run.step.check',
  'update.run.step.install',
  'update.run.step.apply',
];

function stepIndex(run: UpdateRun): number {
  switch (run.phase) {
    case 'checking':
      return 0;
    case 'installing':
    case 'cancelling':
      return 1;
    case 'applying':
      return 2;
    case 'installed':
      return 3;
    default:
      return run.commands.length > 0 ? 1 : 0;
  }
}

function phaseText(run: UpdateRun, t: BotHarnessTranslate): string {
  switch (run.phase) {
    case 'checking':
      return t('update.run.phase.checking');
    case 'installing':
      return run.attempt !== undefined && run.attempt.total > 1 && run.attempt.registry !== ''
        ? t('update.run.phase.attempt', {
            registry: registryHost(run.attempt.registry),
            index: String(run.attempt.index),
            total: String(run.attempt.total),
          })
        : t('update.run.phase.installing');
    case 'cancelling':
      return t('update.run.phase.cancelling');
    case 'applying':
      return t('update.run.phase.applying');
    case 'installed':
      return t('update.run.phase.installed', { version: run.version });
    case 'cancelled':
      return t('update.run.phase.cancelled');
    case 'failed':
      return t('update.run.phase.failed');
  }
}

function registryHost(registry: string): string {
  try {
    return new URL(registry).host || registry;
  } catch {
    return registry;
  }
}

function failureText(run: UpdateRun, t: BotHarnessTranslate): string | undefined {
  const failure = run.failure;
  if (failure === undefined || run.phase !== 'failed') return undefined;
  if (failure.reason === 'unknown-plugin') return t('plugins.install.unknown');
  return t('release.install.failedWith', { reason: failureReason(failure, t) });
}

function RunLog({ run, t }: { run: UpdateRun; t: BotHarnessTranslate }): ReactElement {
  const ref = useRef<HTMLPreElement>(null);
  const follow = useRef(true);
  const size = run.commands.reduce((total, command) => total + command.output.length, 0);
  useLayoutEffect(() => {
    const node = ref.current;
    if (node !== null && follow.current) node.scrollTop = node.scrollHeight;
  }, [size, run.commands.length]);
  const diagnostic = run.commands.length === 0 ? run.failure?.diagnostic : undefined;
  return (
    <pre
      ref={ref}
      {...stylex.props(styles.log)}
      data-update-run-log=""
      tabIndex={0}
      aria-label={t('update.run.log')}
      onScroll={(event) => {
        const node = event.currentTarget;
        follow.current = node.scrollHeight - node.scrollTop - node.clientHeight < 24;
      }}
    >
      {run.commands.length === 0 ? (diagnostic ?? t('update.run.waiting')) : null}
      {run.commands.map((command, index) => (
        <span key={command.id} data-update-run-command={command.command}>
          {index === 0 ? '' : '\n'}
          <span {...stylex.props(styles.command)}>{`$ ${command.command}`}</span>
          {'\n'}
          {command.truncated ? `${t('update.run.truncated')}\n` : ''}
          {command.output.replace(/\s+$/u, '')}
          {command.exitCode === undefined ? null : (
            <span {...stylex.props(command.exitCode === 0 ? styles.exitOk : styles.exitBad)}>
              {`${command.output.trim() === '' ? '' : '\n'}${
                command.exitCode === null
                  ? t('update.run.stopped')
                  : t('update.run.exit', { code: String(command.exitCode) })
              }`}
            </span>
          )}
        </span>
      ))}
    </pre>
  );
}

export function useUpdateRuns(controller: UpdateRunsController): UpdateRunsSnapshot {
  return useSyncExternalStore(controller.source.subscribe, controller.source.getSnapshot);
}

export function UpdateRunPanel({
  controller,
  kind,
  name,
  title,
  t,
}: {
  controller: UpdateRunsController;
  kind: UpdateRunKind;
  name: string;
  title: string;
  t: BotHarnessTranslate;
}): ReactElement | null {
  const { run, cancel } = useUpdateRuns(controller);
  if (run === undefined || run.kind !== kind || run.name !== name) return null;
  const active = updateRunActive(run);
  const failure = failureText(run, t);
  const steps = STEP_KEYS.map((key) => t(key));
  return (
    <section
      {...stylex.props(styles.panel)}
      data-update-run={run.phase}
      aria-label={t('update.run.title', { name: title, version: run.version })}
    >
      <div {...stylex.props(styles.head)}>
        <h3 {...stylex.props(styles.title)}>
          {t('update.run.title', { name: title, version: run.version })}
        </h3>
        {active ? (
          <Button
            size="sm"
            variant="outline"
            disabled={!run.cancellable || run.phase === 'cancelling' || cancel === 'requesting'}
            data-update-run-cancel=""
            onClick={() => {
              void controller.cancel();
            }}
          >
            {t(
              run.phase === 'cancelling' || cancel === 'requesting'
                ? 'update.run.cancelling'
                : 'update.run.cancel',
            )}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            data-update-run-dismiss=""
            onClick={() => {
              controller.dismiss();
            }}
          >
            {t('update.run.dismiss')}
          </Button>
        )}
      </div>
      {run.phase === 'failed' || run.phase === 'cancelled' ? null : (
        <StepProgress label={t('update.run.steps')} steps={steps} step={stepIndex(run)} />
      )}
      <p
        role={failure === undefined ? 'status' : 'alert'}
        aria-live="polite"
        {...stylex.props(
          styles.status,
          run.phase === 'failed' && styles.failed,
          run.phase === 'installed' && styles.done,
        )}
      >
        {failure ?? phaseText(run, t)}
      </p>
      {cancel === 'too-late' || cancel === 'unsupported' ? (
        <p {...stylex.props(styles.note)} role="alert">
          {t(cancel === 'too-late' ? 'update.run.tooLate' : 'update.run.unsupported')}
        </p>
      ) : null}
      <p {...stylex.props(styles.logLabel)}>{t('update.run.log')}</p>
      <RunLog run={run} t={t} />
      {run.failure?.logPath === undefined ? null : (
        <p {...stylex.props(styles.note)}>
          {t('release.install.log', { path: run.failure.logPath })}
        </p>
      )}
    </section>
  );
}
