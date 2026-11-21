import * as stylex from '@stylexjs/stylex';
import { useState, type ReactElement } from 'react';

import { Button } from './ds/button.js';
import { Note } from './ds/note.js';
import { font, ink, type as typeScale } from './ds/tobs.stylex.js';
import { space } from './ds/tokens.stylex.js';
import type { useSubscriptionEngines } from './engine-choice.js';
import type { BotHarnessTranslate } from './locale.js';

const styles = stylex.create({
  detail: { display: 'grid', gap: space.x3, minWidth: 0 },
  row: { display: 'flex', flexWrap: 'wrap', gap: space.x2, alignItems: 'center' },
  link: {
    color: ink.primary,
    fontSize: typeScale.bodySize,
    overflowWrap: 'anywhere',
    textDecoration: 'underline',
  },
  code: {
    color: ink.primary,
    fontFamily: font.familyMono,
    fontSize: typeScale.headingSize,
    lineHeight: typeScale.headingLine,
    fontWeight: typeScale.headingWeight,
  },
});

function CopyValue({
  value,
  label,
  t,
}: {
  value: string;
  label: string;
  t: BotHarnessTranslate;
}): ReactElement {
  const [result, setResult] = useState<'copied' | 'failed'>();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setResult('copied');
    } catch {
      setResult('failed');
    }
  };
  return (
    <Button size="sm" variant="outline" onClick={() => void copy()}>
      {result === 'copied'
        ? t('modelProviders.linkCopied')
        : result === 'failed'
          ? t('modelProviders.copyFailed')
          : label}
    </Button>
  );
}

export function CodexDeviceSignIn({
  engines,
  t,
}: {
  engines: Pick<
    ReturnType<typeof useSubscriptionEngines>,
    'deviceSignIn' | 'cancelSignIn' | 'cancelling' | 'cancelFailed'
  >;
  t: BotHarnessTranslate;
}): ReactElement | null {
  const device = engines.deviceSignIn;
  if (device === undefined) return null;
  const { progress } = device;
  switch (progress.status) {
    case 'completed':
      return <Note tone="success">{t('modelProviders.signedIn')}</Note>;
    case 'failed':
      return <Note tone="danger">{t('modelProviders.deviceSignInFailed')}</Note>;
    case 'expired':
      return <Note tone="danger">{t('modelProviders.deviceSignInExpired')}</Note>;
    case 'cancelled':
      return <Note>{t('modelProviders.deviceSignInCancelled')}</Note>;
    case 'starting':
    case 'pending':
      return (
        <div {...stylex.props(styles.detail)}>
          {progress.status === 'pending' ? (
            <>
              <div {...stylex.props(styles.row)}>
                <a
                  href={progress.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  {...stylex.props(styles.link)}
                >
                  {progress.url}
                </a>
                <CopyValue value={progress.url} label={t('modelProviders.copySignInLink')} t={t} />
              </div>
              <div {...stylex.props(styles.row)}>
                <code {...stylex.props(styles.code)}>{progress.code}</code>
                <CopyValue value={progress.code} label={t('modelProviders.copyDeviceCode')} t={t} />
              </div>
              <Note>
                {t('engine.signingIn')}{' '}
                {t('modelProviders.deviceSignInExpiry', {
                  time: new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(
                    new Date(progress.expiresAt),
                  ),
                })}
              </Note>
            </>
          ) : (
            <Note>{t('modelProviders.deviceSignInStarting')}</Note>
          )}
          <div {...stylex.props(styles.row)}>
            <Button
              size="sm"
              variant="outline"
              disabled={!device.canCancel || engines.cancelling}
              onClick={() => void engines.cancelSignIn()}
            >
              {t(
                engines.cancelling
                  ? 'modelProviders.cancellingSignIn'
                  : 'modelProviders.cancelSignIn',
              )}
            </Button>
          </div>
          {engines.cancelFailed ? (
            <Note tone="danger">{t('modelProviders.cancelSignInFailed')}</Note>
          ) : null}
        </div>
      );
  }
}
