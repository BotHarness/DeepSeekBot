import type { ReactElement, ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';

import type { ConnectSignInCode } from './connect-sign-in.js';
import { CopyChip, StatusBlock } from './ds/status-block.js';
import { StepProgress } from './ds/step-progress.js';
import { color, radius, space, text } from './ds/tokens.stylex.js';

const styles = stylex.create({
  code: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: space.x3,
    padding: space.x4,
    borderRadius: radius.sm,
    backgroundColor: color.base,
    minWidth: 0,
  },
  codeValue: {
    fontFamily: 'var(--dsw-font-mono, ui-monospace, monospace)',
    fontSize: text.titleSize,
    lineHeight: text.titleLine,
    fontWeight: text.strong,
    letterSpacing: '0.08em',
    color: color.fg,
  },
  meta: {
    margin: 0,
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    overflowWrap: 'anywhere',
  },
  failed: { margin: 0, color: color.warning, fontSize: text.bodySize, lineHeight: text.bodyLine },
});

export function ConnectSignInBlock({
  t,
  code,
  title,
  body,
  signInLabel,
  busy = false,
  failed,
  onSignIn,
  data,
  codeMarker,
  children,
}: PropsLocale<'botharness'> & {
  code: ConnectSignInCode | undefined;
  title: string;
  body: ReactNode;
  signInLabel?: string;
  busy?: boolean;
  failed?: string;
  onSignIn(): void;
  data?: Record<`data-${string}`, string>;
  codeMarker?: `data-${string}`;
  children?: ReactNode;
}): ReactElement {
  const steps = (
    <StepProgress
      label={t('devices.connect.panel.steps')}
      steps={[
        t('devices.connect.panel.stepSignIn'),
        t('devices.connect.panel.stepConfirm'),
        t('devices.connect.panel.stepReady'),
      ]}
      step={code === undefined ? 0 : 1}
    />
  );
  const failure =
    failed === undefined ? null : (
      <p role="alert" data-sign-in-failed="" {...stylex.props(styles.failed)}>
        {failed}
      </p>
    );
  if (code === undefined)
    return (
      <StatusBlock
        icon="globe"
        tone={failed === undefined ? 'accent' : 'warning'}
        title={title}
        body={body}
        action={
          <Button variant="primary" size="sm" disabled={busy} onClick={onSignIn}>
            {signInLabel ?? t('devices.connect.signIn')}
          </Button>
        }
        {...(data === undefined ? {} : { data })}
      >
        {steps}
        {failure}
        {children}
      </StatusBlock>
    );
  return (
    <StatusBlock
      icon="lock"
      tone="accent"
      title={t('devices.connect.panel.confirmTitle')}
      body={t('devices.connect.confirm')}
      {...(data === undefined ? {} : { data })}
    >
      {steps}
      <div data-connect-code="" {...stylex.props(styles.code)}>
        <span
          {...(codeMarker === undefined ? {} : { [codeMarker]: '' })}
          {...stylex.props(styles.codeValue)}
        >
          {code.userCode}
        </span>
        <Button
          variant="primary"
          size="sm"
          onClick={() => window.open(code.verificationUri, '_blank', 'noopener')}
        >
          {t('devices.connect.openPage')}
        </Button>
        <p data-connect-switch="" {...stylex.props(styles.meta)}>
          {t('devices.connect.switchAccount')}
        </p>
        <CopyChip
          value={code.verificationUri}
          copyLabel={t('devices.connect.copyLink')}
          copiedLabel={t('devices.connect.copied')}
          marker="data-connect-copy"
          well
        />
      </div>
      {failure}
      {children}
    </StatusBlock>
  );
}
