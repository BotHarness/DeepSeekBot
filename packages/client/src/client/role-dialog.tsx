import { Checkbox } from './ds/checkbox.js';
import { Tag } from './ds/tag.js';
import { useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import { MessagingHelp } from './messaging-help.js';
import { Field, TextAreaField, TextField } from './ds/field.js';
import { FormDialog } from './ds/form-dialog.js';
import { space } from './ds/tokens.stylex.js';
import type { ExternalUserRole, SenderAccessInput } from './pairing-settings.js';
import type { BotHarnessTranslate } from './locale.js';

const labels = {
  approve: 'pairing.approveCapability',
  reject: 'pairing.rejectCapability',
  'save-rules': 'pairing.rulesCapability',
  'review-pairing': 'pairing.reviewCapability',
} as const;

const roleStyles = stylex.create({
  inline: {
    display: 'inline-flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.x2,
  },
  choices: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: space.x4,
  },
});

export function RoleDialog({
  role,
  busy,
  change,
  close,
  t,
}: {
  role?: ExternalUserRole;
  busy: boolean;
  change(input: SenderAccessInput): Promise<void>;
  close(): void;
  t: BotHarnessTranslate;
}): ReactElement {
  const [name, setName] = useState(role?.name ?? '');
  const [behavior, setBehavior] = useState(role?.behavior ?? '');
  const [selected, setSelected] = useState<
    ('approve' | 'reject' | 'review-pairing' | 'save-rules')[]
  >(
    (role?.capabilities ?? []).filter(
      (capability): capability is 'approve' | 'reject' | 'review-pairing' | 'save-rules' =>
        capability === 'approve' ||
        capability === 'reject' ||
        capability === 'review-pairing' ||
        capability === 'save-rules',
    ),
  );
  const [delegable, setDelegable] = useState<
    ('approve' | 'reject' | 'review-pairing' | 'save-rules')[]
  >(
    (role?.delegableCapabilities ?? []).filter(
      (cap): cap is 'approve' | 'reject' | 'review-pairing' | 'save-rules' =>
        cap === 'approve' || cap === 'reject' || cap === 'review-pairing' || cap === 'save-rules',
    ),
  );
  const [failed, setFailed] = useState(false);
  const submit = async () => {
    setFailed(false);
    try {
      await change(
        role
          ? {
              kind: 'edit-role',
              id: role.id,
              expectedRevision: role.revision,
              name,
              behavior,
              capabilities: selected,
              delegableCapabilities: delegable,
            }
          : { kind: 'create-role', name, behavior },
      );
      close();
    } catch {
      setFailed(true);
    }
  };
  return (
    <FormDialog
      size="medium"
      title={t(role ? 'pairing.editRole' : 'pairing.createRole')}
      labels={{ close: t('common.close'), cancel: t('common.cancel') }}
      submitLabel={t(role ? 'pairing.saveRole' : 'pairing.createRole')}
      onCancel={close}
      onClose={() => {
        if (!busy) close();
      }}
      onSubmit={() => void submit()}
      submitDisabled={!name.trim() || !behavior.trim()}
      busy={busy}
      error={failed ? t('pairing.error') : undefined}
    >
      <TextField
        label={t('pairing.roleName')}
        initialFocus
        value={name}
        maxLength={80}
        disabled={busy}
        onChange={setName}
      />
      <TextAreaField
        label={
          <span {...stylex.props(roleStyles.inline)}>
            {t('pairing.behavior')}
            <MessagingHelp title={t('pairing.behavior')} text={t('pairing.policyLimit')} t={t} />
          </span>
        }
        value={behavior}
        maxLength={2000}
        disabled={busy}
        onChange={setBehavior}
      />
      {role ? (
        <Field
          group
          label={
            <span {...stylex.props(roleStyles.inline)}>
              {t('pairing.roleCapabilities')}
              <MessagingHelp
                title={t('pairing.roleCapabilities')}
                text={t('pairing.privateRoleApproval')}
                t={t}
              />
            </span>
          }
        >
          {() => (
            <div {...stylex.props(roleStyles.choices)}>
              {(['approve', 'reject', 'review-pairing', 'save-rules'] as const).map(
                (capability) => (
                  <Checkbox
                    key={capability}
                    label={t(labels[capability])}
                    checked={selected.includes(capability)}
                    disabled={busy}
                    onChange={(checked) =>
                      setSelected((value) =>
                        checked
                          ? [...value, capability]
                          : value.filter((item) => item !== capability),
                      )
                    }
                  />
                ),
              )}
            </div>
          )}
        </Field>
      ) : (
        <div {...stylex.props(roleStyles.inline)}>
          <Tag>{t('pairing.ordinary')}</Tag>
          <MessagingHelp
            title={t('pairing.createRole')}
            text={t('pairing.managementAccess')}
            t={t}
          />
        </div>
      )}
      {role ? (
        <Field
          group
          label={
            <span {...stylex.props(roleStyles.inline)}>
              {t('pairing.delegable')}
              <MessagingHelp
                title={t('pairing.delegable')}
                text={t('pairing.delegationHelp')}
                t={t}
              />
            </span>
          }
        >
          {() => (
            <div {...stylex.props(roleStyles.choices)}>
              {(['approve', 'reject', 'review-pairing', 'save-rules'] as const).map(
                (capability) => (
                  <Checkbox
                    key={capability}
                    label={`${t('pairing.delegateAllow')} · ${t(labels[capability])}`}
                    checked={delegable.includes(capability)}
                    disabled={busy}
                    onChange={(checked) =>
                      setDelegable((value) =>
                        checked
                          ? [...value, capability]
                          : value.filter((item) => item !== capability),
                      )
                    }
                  />
                ),
              )}
            </div>
          )}
        </Field>
      ) : null}
    </FormDialog>
  );
}
