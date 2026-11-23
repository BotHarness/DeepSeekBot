import { useState, type ReactElement } from 'react';
import { Checkbox } from './ds/checkbox.js';
import { FieldStack, TextField } from './ds/field.js';
import { FormDialog } from './ds/form-dialog.js';
import type { BotHarnessTranslate } from './locale.js';
import { TEAM_PASSWORD_MIN_LENGTH, validUsername } from './team-bridge.js';

type OwnerPasswordDialogProps = {
  t: BotHarnessTranslate;
  busy: boolean;
  error: string | undefined;
  onCancel(): void;
} & (
  | {
      kind: 'standalone';
      initialUsername?: string;
      onSubmit(username: string, password: string): void;
    }
  | {
      kind: 'team';
      hasPassword: boolean;
      thenEnable: boolean;
      onSubmit(
        password: string,
        current: string | undefined,
        signOutOthers: boolean | undefined,
      ): void;
    }
);

export function OwnerPasswordDialog(props: OwnerPasswordDialogProps): ReactElement {
  const { t, busy, error, onCancel } = props;
  const standalone = props.kind === 'standalone';
  const hasPassword = !standalone && props.hasPassword;
  const thenEnable = standalone || props.thenEnable;
  const [username, setUsername] = useState(standalone ? (props.initialUsername ?? '') : '');
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [signOutOthers, setSignOutOthers] = useState(true);
  const normalizedUsername = username.trim();
  const passwordTooLong = standalone && new TextEncoder().encode(password).length > 1024;
  const passwordTooShort = password.length < TEAM_PASSWORD_MIN_LENGTH;
  const ready =
    (!standalone || validUsername(normalizedUsername)) &&
    (!hasPassword || current.length > 0) &&
    !passwordTooLong &&
    !passwordTooShort &&
    password === confirmation;
  const passwordError = passwordTooLong
    ? t('connections.ownerSignIn.passwordTooLong')
    : !standalone && password.length > 0 && passwordTooShort
      ? t('team.error.passwordWeak')
      : undefined;
  const fields = (
    <>
      {standalone ? (
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
      ) : null}
      {hasPassword ? (
        <TextField
          label={t('team.password.current')}
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={setCurrent}
          initialFocus
        />
      ) : null}
      <TextField
        label={t('team.password.new')}
        type="password"
        autoComplete="new-password"
        maxLength={standalone ? 1024 : undefined}
        disabled={standalone && busy}
        initialFocus={!standalone && !hasPassword}
        value={password}
        hint={t('team.password.rule', { min: String(TEAM_PASSWORD_MIN_LENGTH) })}
        error={passwordError}
        onChange={setPassword}
      />
      <TextField
        label={t('team.password.confirm')}
        type="password"
        autoComplete="new-password"
        maxLength={standalone ? 1024 : undefined}
        disabled={standalone && busy}
        value={confirmation}
        error={
          confirmation.length > 0 && confirmation !== password
            ? t('team.password.mismatch')
            : undefined
        }
        onChange={setConfirmation}
      />
      {hasPassword ? (
        <Checkbox
          label={t('team.ownerPassword.signOutOthers')}
          checked={signOutOthers}
          onChange={setSignOutOthers}
          disabled={busy}
        />
      ) : null}
    </>
  );
  return (
    <FormDialog
      title={t(
        standalone
          ? 'connections.ownerSignIn.setupTitle'
          : hasPassword
            ? 'team.ownerPassword.changeTitle'
            : 'team.ownerPassword.setupTitle',
      )}
      description={
        standalone
          ? undefined
          : t(thenEnable ? 'team.ownerPassword.enableHint' : 'team.ownerPassword.hint')
      }
      labels={{ close: t('common.close'), cancel: t('common.cancel') }}
      submitLabel={t(thenEnable ? 'team.ownerPassword.saveAndEnable' : 'team.save')}
      submitDisabled={!ready}
      busy={busy}
      error={error}
      onCancel={onCancel}
      onSubmit={() => {
        if (standalone) props.onSubmit(normalizedUsername, password);
        else
          props.onSubmit(
            password,
            hasPassword ? current : undefined,
            hasPassword ? signOutOthers : undefined,
          );
      }}
    >
      {standalone ? fields : <FieldStack>{fields}</FieldStack>}
    </FormDialog>
  );
}
