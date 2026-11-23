import { useCallback, useState, useSyncExternalStore, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import type {
  TeamSignInError,
  TeamSignInFlow,
  TeamSignInState,
  TeamSignInTarget,
} from '@botharness/host-client/team-sign-in';
import { TEAM_PAGE_PASSWORD_MIN_LENGTH } from '@botharness/host-client/shared/team-sign-in-page';

import { FormDialog } from './ds/form-dialog.js';
import { TextField } from './ds/field.js';
import { Note } from './ds/note.js';
import { font } from './ds/tobs.stylex.js';
import { color, radius, space, text } from './ds/tokens.stylex.js';
import type { BotHarnessKey, BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import { remoteHosts } from './remote-hosts.js';
import { getThisHost } from './this-host.js';

const styles = stylex.create({
  body: { display: 'flex', flexDirection: 'column', gap: space.x4, minWidth: 0 },
  host: { margin: 0, fontWeight: text.strong },
  muted: { margin: 0, color: color.muted, fontSize: text.metaSize, lineHeight: text.metaLine },
  fingerprint: {
    display: 'block',
    padding: space.x3,
    borderRadius: radius.sm,
    backgroundColor: color.well,
    fontFamily: font.familyMono,
    overflowWrap: 'anywhere',
  },
});

const ERRORS: Partial<Record<TeamSignInError | 'mismatch', BotHarnessKey>> = {
  'invitation-invalid': 'teamSignIn.error.invitation-invalid',
  'invitation-expired': 'teamSignIn.error.invitation-expired',
  'invitation-version-unsupported': 'teamSignIn.error.invitation-version-unsupported',
  'credentials-invalid': 'teamSignIn.error.credentials-invalid',
  'rate-limited': 'teamSignIn.error.rate-limited',
  'insecure-transport': 'teamSignIn.error.insecure-transport',
  'team-mode-off': 'teamSignIn.error.team-mode-off',
  'member-suspended': 'teamSignIn.error.member-suspended',
  'fingerprint-mismatch': 'teamSignIn.error.fingerprint-mismatch',
  'password-weak': 'teamSignIn.error.password-weak',
  'password-reused': 'teamSignIn.error.password-reused',
  mismatch: 'teamSignIn.error.mismatch',
  unreachable: 'teamSignIn.error.unreachable',
  'private-route': 'teamSignIn.error.private-route',
  'storage-failed': 'teamSignIn.error.storage-failed',
  'this-host': 'teamSignIn.error.this-host',
  'owner-required': 'teamSignIn.error.owner-required',
};

export function teamSignInErrorText(
  t: BotHarnessTranslate,
  code: TeamSignInError | 'mismatch',
  retryAfterSeconds?: number,
): string {
  const key = ERRORS[code];
  if (key === undefined) return t('teamSignIn.error.generic');
  return t(key, {
    seconds: String(retryAfterSeconds ?? 30),
    min: String(TEAM_PAGE_PASSWORD_MIN_LENGTH),
  });
}

const CANCELLED: TeamSignInState = { kind: 'cancelled' };

export function TeamSignInDialog({
  target,
  onDone,
  onClose,
  inline = false,
  footerContainer,
  t,
}: {
  readonly target: TeamSignInTarget;
  readonly onDone: (hostId: string, hostName: string) => void;
  readonly onClose: () => void;
  readonly inline?: boolean;
  readonly footerContainer?: HTMLElement | null | undefined;
  readonly t: BotHarnessTranslate;
}): ReactElement {
  const [flow, setFlow] = useState<TeamSignInFlow>();
  const [startError, setStartError] = useState<string>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [switching, setSwitching] = useState(false);
  const mount = useMountedResource<HTMLSpanElement>(() => {
    const controller = new AbortController();
    let started: TeamSignInFlow | undefined;
    void remoteHosts()
      .teamSignIn(target, getThisHost().id, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) {
          if (result.ok) void result.value.cancel();
          return;
        }
        if (result.ok) {
          started = result.value;
          setFlow(result.value);
        } else setStartError(teamSignInErrorText(t, result.code, result.retryAfterSeconds));
      });
    return () => {
      controller.abort();
      if (started !== undefined && started.getSnapshot().kind !== 'complete') void started.cancel();
    };
  }, [target]);
  const subscribe = useCallback(
    (listener: () => void) => flow?.subscribe(listener) ?? (() => {}),
    [flow],
  );
  const state = useSyncExternalStore(subscribe, () => flow?.getSnapshot() ?? CANCELLED);
  const hostName = flow === undefined ? '' : stateHostName(state);
  const run = async (
    action: () => Promise<
      { ok: true } | { ok: false; code: TeamSignInError; retryAfterSeconds?: number }
    >,
  ): Promise<boolean> => {
    setBusy(true);
    setError(undefined);
    try {
      const result = await action();
      if (!result.ok) {
        if (result.code === 'identity-switch-required') setSwitching(true);
        else setError(teamSignInErrorText(t, result.code, result.retryAfterSeconds));
        return false;
      }
      return true;
    } finally {
      setBusy(false);
    }
  };
  const finish = async (confirmSwitch: boolean): Promise<void> => {
    if (flow === undefined) return;
    let saved: { hostId: string; hostName: string } | undefined;
    const ok = await run(async () => {
      const result = await flow.complete(confirmSwitch);
      if (result.ok) saved = { hostId: result.value.hostId, hostName: result.value.hostName };
      return result;
    });
    if (ok && saved !== undefined) onDone(saved.hostId, saved.hostName);
  };
  const submit = (): void => {
    if (flow === undefined || busy) return;
    if (state.kind === 'fingerprint') {
      const result = flow.confirmFingerprint(state.host.fingerprint);
      if (!result.ok) setError(teamSignInErrorText(t, result.code));
      return;
    }
    if (state.kind === 'sign-in') {
      void run(() =>
        flow.signIn({
          password,
          deviceName: t('remoteHosts.deviceName', { name: getThisHost().name ?? 'Host' }),
        }),
      ).then((ok) => {
        if (ok && flow.getSnapshot().kind !== 'password-change') setPassword('');
      });
      return;
    }
    if (state.kind === 'password-change') {
      if (next.length < TEAM_PAGE_PASSWORD_MIN_LENGTH) {
        setError(teamSignInErrorText(t, 'password-weak'));
        return;
      }
      if (next !== confirm) {
        setError(teamSignInErrorText(t, 'mismatch'));
        return;
      }
      void run(() => flow.changePassword({ current: password, next })).then((ok) => {
        if (!ok) return;
        setPassword('');
        setNext('');
        setConfirm('');
      });
      return;
    }
    if (state.kind === 'identity-confirmation') void finish(switching);
  };
  const current =
    state.kind === 'identity-confirmation'
      ? remoteHosts()
          .getSnapshot()
          .hosts.find((remote) => remote.host.member?.fingerprint === state.member.fingerprint)
          ?.host.member?.displayName
      : undefined;
  if (switching && state.kind === 'identity-confirmation')
    return (
      <>
        <span ref={mount} hidden />
        <FormDialog
          title={t('teamSignIn.switchTitle')}
          inline={inline}
          showCancel={!inline}
          footerContainer={footerContainer}
          labels={{ close: t('common.close'), cancel: t('common.cancel') }}
          submitLabel={t('teamSignIn.switchConfirm')}
          busy={busy}
          error={error}
          danger
          onCancel={() => setSwitching(false)}
          onClose={onClose}
          onSubmit={() => void finish(true)}
          submitData={{ 'data-team-sign-in-submit': 'switch' }}
        >
          <p>
            {current === undefined
              ? t('teamSignIn.switchBody', { name: state.member.displayName })
              : t('teamSignIn.switchBodyNamed', { name: state.member.displayName, current })}
          </p>
        </FormDialog>
      </>
    );
  const submitLabel: BotHarnessKey =
    flow === undefined
      ? 'teamSignIn.continue'
      : state.kind === 'fingerprint'
        ? 'connect.matches'
        : state.kind === 'sign-in'
          ? 'teamSignIn.signIn'
          : state.kind === 'password-change'
            ? 'teamSignIn.changeSubmit'
            : 'teamSignIn.finish';
  const ready =
    flow !== undefined &&
    (state.kind === 'fingerprint' ||
      (state.kind === 'sign-in' && password.length > 0) ||
      (state.kind === 'password-change' && next.length > 0 && confirm.length > 0) ||
      state.kind === 'identity-confirmation');
  return (
    <>
      <span ref={mount} hidden />
      <FormDialog
        title={
          hostName === '' ? t('teamSignIn.titleGeneric') : t('teamSignIn.title', { host: hostName })
        }
        inline={inline}
        showCancel={!inline}
        footerContainer={footerContainer}
        labels={{ close: t('common.close'), cancel: t('common.cancel') }}
        submitLabel={t(submitLabel)}
        submitDisabled={!ready}
        busy={busy}
        error={error ?? startError}
        onCancel={onClose}
        onClose={onClose}
        onSubmit={submit}
        submitData={{ 'data-team-sign-in-submit': state.kind }}
      >
        <div
          data-team-sign-in={flow === undefined ? 'loading' : state.kind}
          {...stylex.props(styles.body)}
        >
          {flow === undefined ? (
            startError === undefined ? (
              <p role="status" {...stylex.props(styles.muted)}>
                {t('connections.reading')}
              </p>
            ) : null
          ) : state.kind === 'fingerprint' ? (
            <>
              <div>
                <p data-team-host="" {...stylex.props(styles.host)}>
                  {state.host.name}
                </p>
                <p {...stylex.props(styles.muted)}>
                  {t('teamSignIn.as', { username: state.username })}
                </p>
              </div>
              <p {...stylex.props(styles.muted)}>{t('teamSignIn.fingerprintHint')}</p>
              <code data-team-fingerprint="" {...stylex.props(styles.fingerprint)}>
                {state.host.fingerprint}
              </code>
            </>
          ) : state.kind === 'sign-in' ? (
            <>
              <div>
                <p data-team-host="" {...stylex.props(styles.host)}>
                  {state.host.name}
                </p>
                <p {...stylex.props(styles.muted)}>
                  {t('teamSignIn.as', { username: state.username })}
                </p>
              </div>
              <TextField
                label={t('teamSignIn.password')}
                hint={t('teamSignIn.passwordHint')}
                type="password"
                autoComplete="current-password"
                name="password"
                value={password}
                onChange={setPassword}
                initialFocus
              />
            </>
          ) : state.kind === 'password-change' ? (
            <>
              <p {...stylex.props(styles.muted)}>{t('teamSignIn.changeHint')}</p>
              <TextField
                label={t('teamSignIn.newPassword')}
                hint={t('teamSignIn.rule', { min: String(TEAM_PAGE_PASSWORD_MIN_LENGTH) })}
                type="password"
                autoComplete="new-password"
                name="next"
                value={next}
                onChange={setNext}
                initialFocus
              />
              <TextField
                label={t('teamSignIn.confirmPassword')}
                type="password"
                autoComplete="new-password"
                name="confirm"
                value={confirm}
                onChange={setConfirm}
              />
            </>
          ) : state.kind === 'identity-confirmation' || state.kind === 'complete' ? (
            <p role="status">{t('teamSignIn.ready', { name: state.member.displayName })}</p>
          ) : (
            <Note>{t('teamSignIn.cancelled')}</Note>
          )}
        </div>
      </FormDialog>
    </>
  );
}

function stateHostName(state: TeamSignInState): string {
  return state.kind === 'fingerprint' || state.kind === 'sign-in' ? state.host.name : '';
}
