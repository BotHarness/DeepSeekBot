import { useRef, useState, type ReactElement } from 'react';
import { BridgeCallError, unwrap, type BridgeCall } from './bridge-transport.js';
import { Button } from './ds/button.js';
import { Note } from './ds/note.js';
import { SettingsRow } from './ds/settings-row.js';
import { Switch } from './ds/switch.js';
import type { BotHarnessTranslate } from './locale.js';
import { memberPage } from './member-page.js';
import { useMountedResource } from './mounted-resource.js';
import { OwnerPasswordDialog } from './owner-password-dialog.js';
import { record, teamRefusal } from './team-bridge.js';
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
  showStatus = false,
}: {
  call: BridgeCall;
  showStatus?: boolean;
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
  const title = t(showStatus ? 'connections.phone.ownerSignIn' : 'connections.ownerSignIn.title');
  return (
    <>
      <SettingsRow
        rootRef={mount}
        title={title}
        data={{ 'data-owner-password-sign-in': '' }}
        description={
          showStatus && view !== undefined
            ? t(view.enabled ? 'connections.phone.ownerOn' : 'connections.phone.ownerOff')
            : username !== undefined
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
            username === undefined || (showStatus && !view.enabled) ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setError(undefined);
                  setSetup(true);
                }}
              >
                {t(showStatus ? 'connections.phone.enableOwner' : 'connections.ownerSignIn.setup')}
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
        <OwnerPasswordDialog
          kind="standalone"
          t={t}
          {...(showStatus && username ? { initialUsername: username } : {})}
          busy={busy}
          error={error}
          onCancel={() => {
            if (busy) return;
            setError(undefined);
            setSetup(false);
          }}
          onSubmit={(username, password) => void save({ enabled: true, username, password })}
        />
      ) : null}
    </>
  );
}
