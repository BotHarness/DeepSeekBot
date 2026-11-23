import { useRef, useState, type ComponentProps, type ReactElement } from 'react';
import type { HostAddressDiscovery } from '@botharness/host-client/password-sign-in';

import { Button } from './ds/button.js';
import { Note } from './ds/note.js';
import { CopyChip, StatusDisclosure } from './ds/status-block.js';

import { TextField } from './ds/field.js';
import { FormDialog } from './ds/form-dialog.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import { remoteHosts, type RemotePasswordSignInError } from './remote-hosts.js';
import { TeamSignInDialog, teamSignInErrorText } from './team-sign-in-dialog.js';
import { getThisHost } from './this-host.js';

export function passwordSignInError(
  t: BotHarnessTranslate,
  code: RemotePasswordSignInError,
  retryAfterSeconds?: number,
): string {
  if (code === 'owner-sign-in-disabled') return t('remoteHosts.address.error.ownerDisabled');
  if (code === 'password-sign-in-unavailable') return t('remoteHosts.address.error.unavailable');
  if (code === 'host-update-required') return t('remoteHosts.address.error.update');
  if (code === 'team-mode-off') return t('remoteHosts.address.error.teamOff');
  if (code === 'credentials-invalid') return t('remoteHosts.address.error.credentials');
  if (code === 'already-paired') return t('remoteHosts.address.error.alreadyPaired');
  if (code === 'fingerprint-mismatch') return t('remoteHosts.address.error.fingerprint');
  return teamSignInErrorText(t, code, retryAfterSeconds);
}

export function AddressFingerprint({
  discovery,
  t,
}: {
  discovery: HostAddressDiscovery;
  t: BotHarnessTranslate;
}): ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <StatusDisclosure
      icon="fingerprint"
      title={t('connect.fingerprint')}
      open={open}
      onToggle={() => setOpen(!open)}
    >
      <CopyChip
        value={discovery.host.fingerprint}
        copiedLabel={t('devices.pair.copied')}
        copyLabel={t('remoteHosts.address.copyFingerprint')}
      />
    </StatusDisclosure>
  );
}

export function AddressPasswordSignInDialog({
  discovery,
  inline,
  footerContainer,
  onBack,
  onPairingCode,
  onClose,
  t,
}: {
  discovery: HostAddressDiscovery;
  inline: boolean;
  footerContainer?: HTMLElement | null | undefined;
  onBack: () => void;
  onPairingCode: () => void;
  onClose: () => void;
  t: BotHarnessTranslate;
}): ReactElement {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const pending = useRef<AbortController>();
  const [continuation, setContinuation] =
    useState<NonNullable<ComponentProps<typeof TeamSignInDialog>['continuation']>>();
  const memberFlow = useRef<NonNullable<typeof continuation>['flow']>();
  const mount = useMountedResource<HTMLSpanElement>(
    () => () => {
      pending.current?.abort();
      if (memberFlow.current?.getSnapshot().kind !== 'complete') {
        void memberFlow.current?.cancel();
      }
      memberFlow.current = undefined;
    },
    [],
  );
  const submit = () => {
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setError(undefined);
    setBusy(true);
    const host = getThisHost();
    void remoteHosts()
      .passwordSignIn({
        discovery,
        username: username.trim(),
        password,
        deviceName: t('remoteHosts.deviceName', { name: host.name ?? 'Host' }).slice(0, 60),
        ...(host.id === undefined ? {} : { localHostId: host.id }),
        signal: controller.signal,
      })
      .then((result) => {
        if (controller.signal.aborted) {
          if (result.ok && result.value.role === 'member') void result.value.flow.cancel();
          return;
        }
        if (result.ok) {
          setPassword('');
          if (result.value.role === 'member') {
            const flow = result.value.flow;
            const currentPassword = flow.getSnapshot().kind === 'password-change' ? password : '';
            const next = { flow, password: currentPassword };
            memberFlow.current = result.value.flow;
            setContinuation(next);
          } else onClose();
        } else {
          if (result.code === 'credentials-invalid') setPassword('');
          setError(passwordSignInError(t, result.code, result.retryAfterSeconds));
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
    <>
      <span ref={mount} hidden />
      {continuation ? (
        <TeamSignInDialog
          continuation={continuation}
          inline={inline}
          footerContainer={footerContainer}
          onClose={onClose}
          onDone={onClose}
          onPasswordChanged={() => setContinuation({ ...continuation, password: '' })}
          t={t}
        />
      ) : (
        <FormDialog
          title={t('teamSignIn.title', { host: discovery.host.name })}
          inline={inline}
          footerContainer={footerContainer}
          labels={{ close: t('common.close'), cancel: t('remoteHosts.address.backToChoice') }}
          submitLabel={t('teamSignIn.signIn')}
          submitDisabled={!username.trim() || !password}
          busy={busy}
          error={error}
          onCancel={onBack}
          onClose={onClose}
          onSubmit={submit}
        >
          <Note>{discovery.route}</Note>
          <TextField
            label={t('teamSignIn.username')}
            autoComplete="username"
            value={username}
            onChange={setUsername}
            initialFocus
          />
          <TextField
            label={t('teamSignIn.password')}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={setPassword}
          />
          <AddressFingerprint discovery={discovery} t={t} />
          <Button variant="ghost" disabled={busy} onClick={onPairingCode}>
            {t('remoteHosts.address.approve')}
          </Button>
        </FormDialog>
      )}
    </>
  );
}
