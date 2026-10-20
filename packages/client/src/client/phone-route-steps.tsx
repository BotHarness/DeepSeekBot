import { useState, type ReactElement, type ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';

import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import { ConfirmDialog } from './ds/form-dialog.js';
import { Note } from './ds/note.js';
import { border, color, radius, size, space, text } from './ds/tokens.stylex.js';

export const TAILSCALE_DOWNLOAD_URL = 'https://tailscale.com/download';
const SIGN_IN_COMMAND = 'tailscale up';

export interface PhoneRouteStatus {
  routes: {
    url: string;
    kind: 'tailscale' | 'connect' | 'loopback';
    ready: boolean;
    issue?: string;
  }[];
  tailscale: 'running' | 'stopped' | 'missing';
  serveCommand: string;
}

export interface PublishFailure {
  code: string;
  error?: string;
  enableUrl?: string;
}

type StepId = 'install' | 'signIn' | 'publish';
type StepState = 'done' | 'current' | 'pending';

const STEPS: readonly StepId[] = ['install', 'signIn', 'publish'];

const styles = stylex.create({
  steps: {
    display: 'flex',
    flexDirection: 'column',
    margin: 0,
    marginTop: space.x3,
    padding: 0,
    listStyle: 'none',
    minWidth: 0,
  },
  step: {
    display: 'grid',
    gridTemplateColumns: `${size.inlineIcon} minmax(0, 1fr)`,
    columnGap: space.x4,
    minWidth: 0,
  },
  rail: { display: 'flex', flexDirection: 'column', alignItems: 'center' },
  dot: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    width: size.inlineIcon,
    height: size.inlineIcon,
    borderRadius: radius.round,
    cornerShape: 'round',
    backgroundColor: color.surface,
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    fontWeight: text.strong,
  },
  dotCurrent: { backgroundColor: color.accent, color: color.onAccent },
  dotDone: { backgroundColor: color.accentTint, color: color.accent },
  line: {
    flexGrow: 1,
    width: border.hairline,
    minHeight: space.x4,
    marginBlock: space.x2,
    backgroundColor: color.border,
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x2,
    minWidth: 0,
    paddingBottom: space.x5,
  },
  last: { paddingBottom: 0 },
  head: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    columnGap: space.x3,
    minHeight: size.inlineIcon,
    paddingTop: space.x1,
  },
  title: {
    margin: 0,
    color: color.muted,
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
  },
  titleCurrent: { color: color.fg, fontWeight: text.strong },
  state: {
    color: color.subtle,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
  },
  stateDone: { color: color.success },
  body: {
    margin: 0,
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    overflowWrap: 'anywhere',
  },
  command: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x3,
    minWidth: 0,
    paddingBlock: space.x2,
    paddingInlineStart: space.x4,
    paddingInlineEnd: space.x2,
    borderRadius: radius.sm,
    backgroundColor: color.surface,
  },
  code: {
    flexGrow: 1,
    minWidth: 0,
    fontFamily: 'var(--dsw-font-mono, ui-monospace, monospace)',
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    color: color.fg,
    overflowWrap: 'anywhere',
    userSelect: 'all',
  },
  actions: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.x3,
  },
  live: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: space.x2,
    color: color.subtle,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
  },
  pulse: {
    width: '6px',
    height: '6px',
    borderRadius: radius.round,
    backgroundColor: color.success,
  },
});

function openExternal(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer');
}

function stepStates(status: PhoneRouteStatus, reachable: boolean): Record<StepId, StepState> {
  const done: Record<StepId, boolean> = {
    install: status.tailscale !== 'missing',
    signIn: status.tailscale === 'running',
    publish: reachable,
  };
  const current = STEPS.find((id) => !done[id]);
  return Object.fromEntries(
    STEPS.map((id) => [id, done[id] ? 'done' : id === current ? 'current' : 'pending']),
  ) as Record<StepId, StepState>;
}

function CommandLine({
  command,
  t,
  stepId,
}: PropsLocale<'botharness'> & {
  command: string;
  stepId: StepId;
}): ReactElement {
  const [copied, setCopied] = useState(false);
  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div {...stylex.props(styles.command)} data-pair-route-command={stepId}>
      <code {...stylex.props(styles.code)}>{command}</code>
      <Button
        variant="ghost"
        size="sm"
        aria-label={t('devices.route.copyCommand')}
        onClick={() => void copy()}
      >
        <ChannelSidebarIcon name={copied ? 'check' : 'copy'} size={14} />
        {copied ? t('devices.pair.copied') : t('devices.route.copy')}
      </Button>
    </div>
  );
}

function failureText(failure: PublishFailure, t: PropsLocale<'botharness'>['t']): string {
  switch (failure.code) {
    case 'serve-needs-enable':
      return t('devices.route.failure.needsEnable');
    case 'serve-denied':
      return t('devices.route.failure.denied');
    case 'serve-other-target':
      return t('devices.route.otherTarget');
    default:
      return t('devices.route.failure.other', {
        detail: failure.error ?? failure.code,
      });
  }
}

export function PhoneRouteSteps({
  t,
  status,
  reachable,
  port,
  onPublish,
}: PropsLocale<'botharness'> & {
  status: PhoneRouteStatus;
  reachable: boolean;
  port: string;
  onPublish: () => Promise<PublishFailure | undefined>;
}): ReactElement {
  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState(false);
  const [failure, setFailure] = useState<PublishFailure>();
  const states = stepStates(status, reachable);
  const otherTarget = status.routes.some(
    (route) => route.kind === 'tailscale' && route.issue === 'serve-other-target',
  );

  const run = async (): Promise<void> => {
    setConfirming(false);
    setRunning(true);
    setFailure(undefined);
    try {
      setFailure(await onPublish());
    } finally {
      setRunning(false);
    }
  };

  const bodies: Record<StepId, ReactNode> = {
    install: (
      <>
        <p {...stylex.props(styles.body)}>{t('devices.route.step.install.body')}</p>
        <div {...stylex.props(styles.actions)}>
          <Button variant="outline" size="sm" onClick={() => openExternal(TAILSCALE_DOWNLOAD_URL)}>
            <ChannelSidebarIcon name="external-link" size={14} />
            {t('devices.route.step.install.action')}
          </Button>
        </div>
      </>
    ),
    signIn: (
      <>
        <p {...stylex.props(styles.body)}>{t('devices.route.step.signIn.body')}</p>
        <CommandLine t={t} command={SIGN_IN_COMMAND} stepId="signIn" />
      </>
    ),
    publish: (
      <>
        <p {...stylex.props(styles.body)}>
          {otherTarget ? t('devices.route.otherTarget') : t('devices.route.step.publish.body')}
        </p>
        {otherTarget ? null : (
          <div {...stylex.props(styles.actions)}>
            <Button
              variant="primary"
              size="sm"
              disabled={running}
              onClick={() => setConfirming(true)}
              data-pair-route-run=""
            >
              {running ? t('devices.route.running') : t('devices.route.run')}
            </Button>
          </div>
        )}
        <p {...stylex.props(styles.body)}>
          {otherTarget ? t('devices.route.manualOnly') : t('devices.route.manual')}
        </p>
        <CommandLine t={t} command={status.serveCommand} stepId="publish" />
        {failure === undefined ? null : (
          <>
            <Note tone="danger">{failureText(failure, t)}</Note>
            {failure.enableUrl === undefined ? null : (
              <div {...stylex.props(styles.actions)}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openExternal(failure.enableUrl!)}
                >
                  <ChannelSidebarIcon name="external-link" size={14} />
                  {t('devices.route.enableAction')}
                </Button>
              </div>
            )}
          </>
        )}
      </>
    ),
  };

  return (
    <div data-pair-route-steps={reachable ? 'done' : status.tailscale}>
      <span {...stylex.props(styles.live)} aria-live="polite">
        <span aria-hidden="true" {...stylex.props(styles.pulse)} />
        {reachable ? t('devices.route.ready') : t('devices.route.watching')}
      </span>
      <ol {...stylex.props(styles.steps)} aria-label={t('devices.route.stepsLabel')}>
        {STEPS.map((id, index) => {
          const state = states[id];
          const last = index === STEPS.length - 1;
          return (
            <li
              key={id}
              data-pair-route-step={id}
              data-state={state}
              aria-current={state === 'current' ? 'step' : undefined}
              {...stylex.props(styles.step)}
            >
              <span {...stylex.props(styles.rail)}>
                <span
                  {...stylex.props(
                    styles.dot,
                    state === 'current' && styles.dotCurrent,
                    state === 'done' && styles.dotDone,
                  )}
                >
                  {state === 'done' ? <ChannelSidebarIcon name="check" size={14} /> : index + 1}
                </span>
                {last ? null : <span aria-hidden="true" {...stylex.props(styles.line)} />}
              </span>
              <div {...stylex.props(styles.content, last && styles.last)}>
                <div {...stylex.props(styles.head)}>
                  <p {...stylex.props(styles.title, state === 'current' && styles.titleCurrent)}>
                    {t(`devices.route.step.${id}.title`, { port })}
                  </p>
                  <span {...stylex.props(styles.state, state === 'done' && styles.stateDone)}>
                    {t(`devices.route.state.${state}`)}
                  </span>
                </div>
                {state === 'current' ? bodies[id] : null}
              </div>
            </li>
          );
        })}
      </ol>
      {confirming ? (
        <ConfirmDialog
          title={t('devices.route.confirm.title')}
          description={t('devices.route.confirm.description', { port })}
          labels={{ close: t('common.close'), cancel: t('common.cancel') }}
          confirmLabel={t('devices.route.confirm.action')}
          danger={false}
          onCancel={() => setConfirming(false)}
          onConfirm={() => void run()}
        >
          <CommandLine t={t} command={status.serveCommand} stepId="publish" />
        </ConfirmDialog>
      ) : null}
    </div>
  );
}
