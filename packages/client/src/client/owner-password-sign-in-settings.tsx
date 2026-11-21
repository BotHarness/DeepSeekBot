import { useRef, useState, type ReactElement } from 'react';
import { BridgeCallError, unwrap, type BridgeCall } from './bridge-transport.js';
import { Button } from './ds/button.js';
import { TextField } from './ds/field.js';
import { FormDialog } from './ds/form-dialog.js';
import { Note } from './ds/note.js';
import { SettingsRow } from './ds/settings-row.js';
import { Switch } from './ds/switch.js';
import type { BotHarnessTranslate } from './locale.js';
import { memberPage } from './member-page.js';
import { useMountedResource } from './mounted-resource.js';
import { record, TEAM_PASSWORD_MIN_LENGTH, teamRefusal } from './team-bridge.js';
import { refreshTeamMode } from './team-state.js';

type SignInView = { enabled: false } | { enabled: boolean; username: string };
type SignInRead =
  | { kind: 'loading' | 'failed' | 'unavailable' }
  | { kind: 'ready'; value: SignInView };

function parseView(value: unknown): SignInView {
  const data = record(value);
  const enabled = data?.['enabled'];
  const username = data?.['username'];
  if (typeof enabled === 'boolean' && typeof username === 'string' && username.length > 0)
    return { enabled, username };
  if (enabled === false && username === undefined) return { enabled: false };
  throw new Error('owner-password-sign-in-response-invalid');
}

function setupError(t: BotHarnessTranslate, error: unknown): string {
  const code = teamRefusal(error);
  if (code === 'username-invalid') return t('team.error.usernameInvalid');
  if (code === 'username-taken') return t('team.error.usernameTaken');
  if (code === 'password-weak') return t('team.error.passwordWeak');
  return t('connections.ownerSignIn.saveFailed');
}

function unavailable(error: unknown): boolean {
  return (
    error instanceof BridgeCallError &&
    [
      'permission-required',
      'owner-required',
      'member-unavailable',
      'remote-access/denied',
    ].includes(error.code)
  );
}

type ConfigureInput =
  | { enabled: boolean; username?: never; password?: never }
  | { enabled: true; username: string; password: string };

export function OwnerPasswordSignInSettings({
  call,
  t,
}: {
  call: BridgeCall;
  t: BotHarnessTranslate;
}): ReactElement | null {
  const [read, setRead] = useState<SignInRead>({ kind: 'loading' });
  const [setup, setSetup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const lifetime = useRef<AbortController>();
  const load = (signal: AbortSignal): void => {
    setRead({ kind: 'loading' });
    void unwrap(call, 'ownerPasswordSignIn', {}, signal)
      .then(parseView)
      .then((value) => {
        if (!signal.aborted) setRead({ kind: 'ready', value });
      })
      .catch((failure: unknown) => {
        if (!signal.aborted) setRead({ kind: unavailable(failure) ? 'unavailable' : 'failed' });
      });
  };
  const mount = useMountedResource<HTMLDivElement>(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    load(controller.signal);
    return () => controller.abort();
  }, [call]);
  if (memberPage() || read.kind === 'unavailable') return null;

  const save = async (input: ConfigureInput): Promise<void> => {
    const signal = lifetime.current?.signal;
    if (!signal || signal.aborted || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const result = parseView(await unwrap(call, 'ownerPasswordSignInSet', input, signal));
      if (signal.aborted) return;
      setRead({ kind: 'ready', value: result });
      setSetup(false);
      if (input.username !== undefined) void refreshTeamMode(call);
    } catch (failure) {
      if (signal.aborted) return;
      if (unavailable(failure)) {
        setSetup(false);
        setRead({ kind: 'unavailable' });
      } else {
        setError(setupError(t, failure));
      }
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  };

  const view = read.kind === 'ready' ? read.value : undefined;
  const username = view && 'username' in view ? view.username : undefined;
  const title = t('connections.ownerSignIn.title');
  return (
    <>
      <SettingsRow
        rootRef={mount}
        title={title}
        data={{ 'data-owner-password-sign-in': '' }}
        description={
          username !== undefined
            ? t('connections.ownerSignIn.username', { username })
            : read.kind === 'failed'
              ? t('connections.ownerSignIn.loadFailed')
              : undefined
        }
        info={
          username === undefined
            ? undefined
            : { label: title, text: t('connections.ownerSignIn.disableHint') }
        }
        control={
          view !== undefined ? (
            username === undefined ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setError(undefined);
                  setSetup(true);
                }}
              >
                {t('connections.ownerSignIn.setup')}
              </Button>
            ) : (
              <Switch
                label={title}
                checked={view.enabled}
                disabled={busy}
                onChange={(enabled) => void save({ enabled })}
              />
            )
          ) : read.kind === 'failed' ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const signal = lifetime.current?.signal;
                if (signal && !signal.aborted) load(signal);
              }}
            >
              {t('devices.connection.retry')}
            </Button>
          ) : undefined
        }
      >
        {!setup && error !== undefined ? <Note tone="danger">{error}</Note> : null}
      </SettingsRow>
      {setup ? (
        <SetupDialog
          t={t}
          busy={busy}
          error={error}
          cancel={() => {
            if (busy) return;
            setError(undefined);
            setSetup(false);
          }}
          submit={(username, password) => void save({ enabled: true, username, password })}
        />
      ) : null}
    </>
  );
}

function SetupDialog({
  t,
  busy,
  error,
  cancel,
  submit,
}: {
  t: BotHarnessTranslate;
  busy: boolean;
  error: string | undefined;
  cancel(): void;
  submit(username: string, password: string): void;
}): ReactElement {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const validUsername = /^[a-z0-9][a-z0-9._-]{1,31}$/u.test(username.trim());
  const passwordTooLong = new TextEncoder().encode(password).length > 1024;
  const validPassword = password.length >= TEAM_PASSWORD_MIN_LENGTH && !passwordTooLong;
  return (
    <FormDialog
      title={t('connections.ownerSignIn.setupTitle')}
      labels={{ close: t('common.close'), cancel: t('common.cancel') }}
      submitLabel={t('team.ownerPassword.saveAndEnable')}
      busy={busy}
      error={error}
      submitDisabled={!validUsername || !validPassword || password !== confirmation}
      onCancel={cancel}
      onSubmit={() => submit(username.trim(), password)}
    >
      <TextField
        label={t('team.members.username')}
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={32}
        disabled={busy}
        initialFocus
        value={username}
        hint={t('connections.ownerSignIn.usernameRule')}
        onChange={setUsername}
      />
      <TextField
        label={t('team.password.new')}
        type="password"
        autoComplete="new-password"
        maxLength={1024}
        disabled={busy}
        value={password}
        hint={t('team.password.rule', { min: String(TEAM_PASSWORD_MIN_LENGTH) })}
        error={passwordTooLong ? t('connections.ownerSignIn.passwordTooLong') : undefined}
        onChange={setPassword}
      />
      <TextField
        label={t('team.password.confirm')}
        type="password"
        autoComplete="new-password"
        maxLength={1024}
        disabled={busy}
        value={confirmation}
        error={
          confirmation.length > 0 && confirmation !== password
            ? t('team.password.mismatch')
            : undefined
        }
        onChange={setConfirmation}
      />
    </FormDialog>
  );
}
