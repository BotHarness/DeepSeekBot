import { useRef, useState, type ReactElement } from 'react';

import { TextField } from './ds/field.js';
import { FormDialog } from './ds/form-dialog.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import { remoteHosts, type RemoteOwnerSignInError } from './remote-hosts.js';
import { teamSignInErrorText } from './team-sign-in-dialog.js';
import { getThisHost } from './this-host.js';

function httpsOrigin(input: string): string | undefined {
  try {
    const url = new URL(input.includes('://') ? input : 'https://' + input);
    if (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.hash &&
      !url.search &&
      url.pathname === '/'
    )
      return url.origin;
  } catch {}
}

function signInError(
  t: BotHarnessTranslate,
  code: RemoteOwnerSignInError,
  retryAfterSeconds?: number,
): string {
  if (code === 'owner-sign-in-disabled') return t('ownerSignIn.error.disabled');
  if (code === 'already-paired') return t('remoteHosts.error.already-paired');
  return teamSignInErrorText(t, code, retryAfterSeconds);
}

export function OwnerSignInDialog({
  inline,
  footerContainer,
  onBack,
  onClose,
  t,
}: {
  inline: boolean;
  footerContainer?: HTMLElement | null | undefined;
  onBack: () => void;
  onClose: () => void;
  t: BotHarnessTranslate;
}): ReactElement {
  const [address, setAddress] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const pending = useRef<AbortController>();
  const mount = useMountedResource<HTMLSpanElement>(() => () => pending.current?.abort(), []);
  const submit = () => {
    if (pending.current) return;
    const route = httpsOrigin(address.trim());
    if (!route) {
      setError(t('teamSignIn.error.insecure-transport'));
      return;
    }
    const controller = new AbortController();
    pending.current = controller;
    setError(undefined);
    setBusy(true);
    const host = getThisHost();
    void remoteHosts()
      .ownerSignIn({
        route,
        username: username.trim(),
        password,
        deviceName: t('remoteHosts.deviceName', { name: host.name ?? 'Host' }).slice(0, 60),
        ...(host.id === undefined ? {} : { localHostId: host.id }),
        signal: controller.signal,
      })
      .then((result) => {
        if (controller.signal.aborted) return;
        if (result.ok) {
          setPassword('');
          onClose();
        } else {
          if (result.code === 'credentials-invalid') setPassword('');
          setError(signInError(t, result.code, result.retryAfterSeconds));
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(t('teamSignIn.error.generic'));
      })
      .finally(() => {
        if (pending.current === controller) pending.current = undefined;
        if (!controller.signal.aborted) setBusy(false);
      });
  };
  return (
    <FormDialog
      title={t('ownerSignIn.title')}
      description={t('ownerSignIn.hint')}
      inline={inline}
      showCancel={!inline}
      footerContainer={footerContainer}
      labels={{ close: t('common.close'), cancel: t('connections.back') }}
      submitLabel={t('teamSignIn.signIn')}
      submitDisabled={!address.trim() || !username.trim() || !password}
      busy={busy}
      error={error}
      onCancel={onBack}
      onClose={onClose}
      onSubmit={submit}
    >
      <span ref={mount} hidden />
      <TextField
        label={t('teamSignIn.address')}
        placeholder="https://"
        inputMode="url"
        autoComplete="url"
        value={address}
        onChange={setAddress}
        initialFocus
      />
      <TextField
        label={t('teamSignIn.username')}
        autoComplete="username"
        value={username}
        onChange={setUsername}
      />
      <TextField
        label={t('teamSignIn.password')}
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={setPassword}
      />
    </FormDialog>
  );
}
