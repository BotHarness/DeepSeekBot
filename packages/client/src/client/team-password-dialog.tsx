import { useState, type ReactElement } from 'react';

import type { BridgeCall } from './bridge.js';
import { FieldStack, TextField } from './ds/field.js';
import { FormDialog } from './ds/form-dialog.js';
import { Note } from './ds/note.js';
import type { BotHarnessTranslate } from './locale.js';
import { TEAM_PASSWORD_MIN_LENGTH, changeOwnPassword, teamRefusal } from './team-bridge.js';

function errorText(t: BotHarnessTranslate, error: unknown): string {
  switch (teamRefusal(error)) {
    case 'credentials-invalid':
      return t('team.error.currentPasswordWrong');
    case 'password-weak':
      return t('team.error.passwordWeak');
    case 'password-reused':
      return t('team.error.passwordReused');
    default:
      return t('team.error.generic');
  }
}

export function MemberPasswordDialog({
  call,
  t,
  forced,
  onCancel,
  onChanged,
}: {
  call: BridgeCall;
  t: BotHarnessTranslate;
  forced: boolean;
  onCancel(): void;
  onChanged(): void;
}): ReactElement {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const short = next.length > 0 && next.length < TEAM_PASSWORD_MIN_LENGTH;
  const same = next.length > 0 && next === current;
  const mismatch = confirm.length > 0 && confirm !== next;
  const ready =
    current.length > 0 && next.length >= TEAM_PASSWORD_MIN_LENGTH && confirm === next && !same;
  return (
    <FormDialog
      title={t(forced ? 'team.password.forcedTitle' : 'team.password.changeTitle')}
      description={forced ? t('team.password.forcedHint') : undefined}
      labels={{ close: t('common.close'), cancel: t('common.cancel') }}
      submitLabel={t('team.password.submit')}
      submitDisabled={!ready}
      showCancel={!forced}
      {...(forced ? {} : { onClose: onCancel })}
      busy={busy}
      error={error === undefined ? undefined : <Note tone="danger">{error}</Note>}
      onCancel={forced ? () => {} : onCancel}
      submitData={{ 'data-team-password-submit': '' }}
      onSubmit={() => {
        setBusy(true);
        setError(undefined);
        changeOwnPassword(call, current, next)
          .then(onChanged)
          .catch((failure: unknown) => {
            setError(errorText(t, failure));
            setBusy(false);
          });
      }}
    >
      <FieldStack>
        <TextField
          label={t(forced ? 'team.password.initial' : 'team.password.current')}
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={setCurrent}
          initialFocus
        />
        <TextField
          label={t('team.password.new')}
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={setNext}
          hint={t('team.password.rule', { min: String(TEAM_PASSWORD_MIN_LENGTH) })}
          error={
            short ? t('team.error.passwordWeak') : same ? t('team.error.passwordReused') : undefined
          }
        />
        <TextField
          label={t('team.password.confirm')}
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={setConfirm}
          error={mismatch ? t('team.password.mismatch') : undefined}
        />
      </FieldStack>
    </FormDialog>
  );
}
