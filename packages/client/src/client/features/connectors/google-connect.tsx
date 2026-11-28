import * as stylex from '@stylexjs/stylex';
import { useState, type ReactElement, type ReactNode } from 'react';

import { errorMessage } from '../../bridge.js';
import { Button } from '../../ds/button.js';
import { Callout } from '../../ds/callout.js';
import { FieldStack, TextField } from '../../ds/field.js';
import { FormDialog } from '../../ds/form-dialog.js';
import { Note } from '../../ds/note.js';
import { SettingsRow } from '../../ds/settings-row.js';
import { CopyChip } from '../../ds/status-block.js';
import { StepProgress } from '../../ds/step-progress.js';
import { space } from '../../ds/tokens.stylex.js';
import type { BotHarnessTranslate } from '../../locale.js';
import { LoadingSkeleton } from '../../loading-skeleton.js';
import { useMountedResource } from '../../mounted-resource.js';
import {
  GOOGLE_SERVICE,
  type ConnectorActions,
  type ConnectorsView,
  type GoogleSetup,
} from './bridge.js';
import { ConnectorLogo, type FetchLogos } from './logos.js';

export const GOOGLE_CONSOLE = 'https://console.cloud.google.com/apis/credentials';
const API_LIBRARY = 'https://console.cloud.google.com/apis/library/';
const DEFAULT_LABEL = 'Google Workspace';

const styles = stylex.create({
  stack: { display: 'flex', flexDirection: 'column', gap: space.x3, minWidth: 0 },
  steps: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x3,
    margin: 0,
    paddingInlineStart: space.x5,
  },
  apis: { display: 'flex', flexWrap: 'wrap', gap: space.x3, marginTop: space.x1 },
  redirect: { marginTop: space.x1, minWidth: 0 },
});

export type GoogleActions = Required<
  Pick<ConnectorActions, 'connectorGoogleSetup' | 'connectorGoogleAdd' | 'connectorGoogleLogin'>
>;

export function googleActions(actions: ConnectorActions): GoogleActions | undefined {
  const { connectorGoogleSetup, connectorGoogleAdd, connectorGoogleLogin } = actions;
  return connectorGoogleSetup === undefined ||
    connectorGoogleAdd === undefined ||
    connectorGoogleLogin === undefined
    ? undefined
    : { connectorGoogleSetup, connectorGoogleAdd, connectorGoogleLogin };
}

export function googleApp(t: BotHarnessTranslate) {
  return { service: GOOGLE_SERVICE, name: t('connectors.google.name') };
}

export function googleWriteWaiting(account: ConnectorsView['accounts'][number]): boolean {
  return (
    account.provider === 'google' &&
    account.status === 'active' &&
    account.access !== 'write' &&
    account.grants.some((grant) => grant.access === 'write')
  );
}

function SetupSteps({ setup, t }: { setup: GoogleSetup; t: BotHarnessTranslate }): ReactElement {
  return (
    <Callout
      tone="muted"
      title={t('connectors.google.consoleTitle')}
      data={{ 'data-google-setup': '' }}
    >
      <ol aria-label={t('connectors.google.steps')} {...stylex.props(styles.steps)}>
        <li>
          {t('connectors.google.enableApis')}
          <span {...stylex.props(styles.apis)}>
            {setup.apis.map((api) => (
              <a
                key={api.id}
                href={`${API_LIBRARY}${api.id}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {api.name}
              </a>
            ))}
          </span>
        </li>
        <li>
          {t('connectors.google.createClient')}
          <div {...stylex.props(styles.redirect)}>
            {setup.redirectUri === undefined ? (
              <Note tone="warning">{t('connectors.google.noRedirect')}</Note>
            ) : (
              <CopyChip
                value={setup.redirectUri}
                copyLabel={t('connectors.google.copyRedirect')}
                copiedLabel={t('connectors.google.copied')}
                marker="data-google-redirect"
                well
              />
            )}
          </div>
        </li>
        <li>{t('connectors.google.publish', { days: setup.limits.testingRefreshTokenDays })}</li>
      </ol>
      <a href={GOOGLE_CONSOLE} target="_blank" rel="noopener noreferrer">
        {t('connectors.google.openConsole')}
      </a>
    </Callout>
  );
}

export function GoogleConnectDialog({
  actions,
  logos,
  t,
  onCancel,
  onBack,
  onLinked,
}: {
  actions: GoogleActions;
  logos?: FetchLogos | undefined;
  t: BotHarnessTranslate;
  onCancel: () => void;
  onBack?: (() => void) | undefined;
  onLinked: (accountId: string, url: string) => void;
}): ReactElement {
  const [setup, setSetup] = useState<GoogleSetup | undefined>();
  const [replacing, setReplacing] = useState(false);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const labels = { close: t('common.close'), cancel: t('common.cancel') };

  const mount = useMountedResource<HTMLDivElement>(() => {
    let live = true;
    actions.connectorGoogleSetup().then(
      (next) => {
        if (live) setSetup(next);
      },
      (failure: unknown) => {
        if (live) setError(t('connectors.error', { message: errorMessage(failure) }));
      },
    );
    return () => {
      live = false;
    };
  }, [actions]);

  const run = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await work();
    } catch (failure) {
      setError(t('connectors.error', { message: errorMessage(failure) }));
    } finally {
      setBusy(false);
    }
  };

  const entering = setup !== undefined && (!setup.configured || replacing);
  const back =
    onBack === undefined ? undefined : (
      <Button variant="ghost" size="sm" disabled={busy} onClick={onBack}>
        {t('connectors.connect.change')}
      </Button>
    );
  const heading = (
    <SettingsRow
      title={t('connectors.google.name')}
      description={t('connectors.google.about')}
      icon={<ConnectorLogo service={GOOGLE_SERVICE} size={28} logos={logos} />}
    />
  );
  const progress = (
    <StepProgress
      label={t('connectors.google.steps')}
      steps={[t('connectors.google.stepClient'), t('connectors.google.stepSignIn')]}
      step={entering ? 0 : 1}
    />
  );

  let body: ReactNode;
  let submitLabel = t('connectors.google.signIn');
  let submitDisabled = true;
  let submit: (() => void) | undefined;
  if (setup === undefined) {
    body =
      error === undefined ? (
        <LoadingSkeleton kind="sidebar" label={t('connectors.google.title')} />
      ) : null;
  } else if (entering) {
    submitLabel = t('connectors.google.save');
    submitDisabled = clientId.trim() === '' || clientSecret.trim() === '';
    submit = () =>
      void run(async () => {
        const next = await actions.connectorGoogleAdd({
          clientId: clientId.trim(),
          clientSecret: clientSecret.trim(),
        });
        setSetup(next);
        setClientSecret('');
        setReplacing(false);
      });
    body = (
      <>
        <SetupSteps setup={setup} t={t} />
        <TextField
          label={t('connectors.google.clientId')}
          placeholder="…apps.googleusercontent.com"
          autoComplete="off"
          spellCheck={false}
          monospace
          initialFocus
          value={clientId}
          onChange={setClientId}
          data-google-client-id=""
        />
        <TextField
          label={t('connectors.google.clientSecret')}
          hint={t('connectors.google.secretHint')}
          type="password"
          autoComplete="off"
          monospace
          value={clientSecret}
          onChange={setClientSecret}
          data-google-client-secret=""
        />
        <Note inset>{t('connectors.google.noToken')}</Note>
      </>
    );
  } else {
    submitDisabled = setup.redirectUri === undefined;
    submit = () =>
      void run(async () => {
        const named = label.trim() === '' ? DEFAULT_LABEL : label.trim();
        const linked = await actions.connectorGoogleLogin(named);
        window.open(linked.url, '_blank', 'noopener,noreferrer');
        onLinked(linked.account.accountId, linked.url);
      });
    body = (
      <>
        <SettingsRow
          title={t('connectors.google.client')}
          description={t('connectors.google.saved')}
          control={
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              data-google-client-replace=""
              onClick={() => {
                setError(undefined);
                setReplacing(true);
              }}
            >
              {t('connectors.google.replace')}
            </Button>
          }
        />
        <TextField
          label={t('connectors.connect.label')}
          hint={t('connectors.google.labelHint')}
          placeholder={DEFAULT_LABEL}
          initialFocus
          value={label}
          onChange={setLabel}
          data-google-label=""
        />
        {setup.redirectUri === undefined ? (
          <Note tone="warning">{t('connectors.google.noRedirect')}</Note>
        ) : (
          <Note inset>{t('connectors.google.hostBrowser')}</Note>
        )}
      </>
    );
  }

  return (
    <FormDialog
      title={t('connectors.google.title')}
      labels={labels}
      submitLabel={submitLabel}
      submitDisabled={submitDisabled}
      submitData={{ 'data-google-submit': entering ? 'client' : 'sign-in' }}
      busy={busy}
      error={error}
      scroll
      onCancel={onCancel}
      onSubmit={submit}
      secondary={
        replacing ? (
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => setReplacing(false)}>
            {t('connectors.google.keep')}
          </Button>
        ) : (
          back
        )
      }
    >
      <div ref={mount} data-google-connect="" {...stylex.props(styles.stack)}>
        <FieldStack>
          {heading}
          {progress}
          {body}
        </FieldStack>
      </div>
    </FormDialog>
  );
}
