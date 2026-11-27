import type { ReactElement } from 'react';

import { MaskedApprovalCard } from './approval-mask.js';
import { Button } from './ds/button.js';
import { Note } from './ds/note.js';
import { Select } from './ds/select.js';
import {
  SettingsGroupPart,
  SettingsRow,
  SettingsSection,
  SettingsValue,
} from './ds/settings-row.js';
import type { BotHarnessTranslate } from './locale.js';
import type { ApprovalKey, ChannelPolicy, PolicyValue } from './team-channels-bridge.js';

type Choice = 'allow' | 'deny';

function choiceOf(policy: ChannelPolicy, key: ApprovalKey): Choice {
  const value: PolicyValue = policy.everyone[key];
  return value === 'allow' ? 'allow' : 'deny';
}

export function ChannelApprovalSettings({
  t,
  policy,
  manager,
  disabled,
  onChange,
}: {
  t: BotHarnessTranslate;
  policy: ChannelPolicy;
  manager: boolean;
  disabled: boolean;
  onChange(policy: ChannelPolicy): void;
}): ReactElement {
  const set = (key: ApprovalKey, value: Choice): void =>
    onChange({
      ...policy,
      approvalMode: 'channel',
      everyone: { ...policy.everyone, [key]: value },
    });
  const legacy = policy.approvalMode !== 'channel';
  const labels: Record<ApprovalKey, Record<Choice, string>> = {
    seeApprovals: { allow: t('channelApprovals.everyone'), deny: t('channelApprovals.tableOnly') },
    decideApprovals: {
      allow: t('channelApprovals.everyone'),
      deny: t('channelApprovals.ownersAndTable'),
    },
  };
  const legacyRow = (key: ApprovalKey, title: string, value: string) => (
    <SettingsRow
      title={title}
      data={{ 'data-channel-approval-row': key }}
      control={<SettingsValue>{value}</SettingsValue>}
    />
  );
  const row = (
    key: ApprovalKey,
    title: string,
    description: string,
    options: Record<Choice, string>,
  ) => (
    <SettingsRow
      title={title}
      description={description}
      data={{ 'data-channel-approval-row': key }}
      control={
        manager ? (
          <Select<Choice>
            label={title}
            value={choiceOf(policy, key)}
            disabled={disabled}
            options={[
              { value: 'allow', label: options.allow },
              { value: 'deny', label: options.deny },
            ]}
            onChange={(value) => set(key, value)}
          />
        ) : (
          <SettingsValue>{options[choiceOf(policy, key)]}</SettingsValue>
        )
      }
    />
  );
  return (
    <div data-channel-approvals={legacy ? 'legacy' : 'channel'}>
      {manager ? null : <Note>{t('channelApprovals.managersOnly')}</Note>}
      <SettingsSection
        title={t('channelApprovals.title')}
        description={t(legacy ? 'channelApprovals.legacyState' : 'channelApprovals.byRole')}
      >
        {legacy
          ? legacyRow('seeApprovals', t('channelApprovals.see'), t('channelApprovals.legacySee'))
          : row(
              'seeApprovals',
              t('channelApprovals.see'),
              t('channelApprovals.seeHint'),
              labels.seeApprovals,
            )}
        {legacy
          ? legacyRow(
              'decideApprovals',
              t('channelApprovals.decide'),
              t('channelApprovals.legacyDecide'),
            )
          : row(
              'decideApprovals',
              t('channelApprovals.decide'),
              t('channelApprovals.decideHint'),
              labels.decideApprovals,
            )}
        {legacy && manager ? (
          <SettingsRow
            title={t('channelApprovals.enable')}
            description={t('channelApprovals.legacy', {
              see: labels.seeApprovals[choiceOf(policy, 'seeApprovals')],
              decide: labels.decideApprovals[choiceOf(policy, 'decideApprovals')],
            })}
            data={{ 'data-channel-approval-enable': '' }}
            control={
              <Button
                variant="outline"
                disabled={disabled}
                onClick={() => onChange({ ...policy, approvalMode: 'channel' })}
              >
                {t('channelApprovals.enable')}
              </Button>
            }
          />
        ) : null}
        <SettingsRow
          title={t('channelApprovals.unhandled')}
          control={<SettingsValue>{t('channelApprovals.unhandledValue')}</SettingsValue>}
        />
      </SettingsSection>
      <SettingsSection title={t('channelApprovals.preview')}>
        <SettingsGroupPart data={{ 'data-channel-approval-preview': '' }}>
          <MaskedApprovalCard
            t={t}
            approval={{
              masked: true,
              kind: 'tool-approval',
              state: 'pending',
              botSlug: '',
              requestedAt: new Date(0).toISOString(),
            }}
          />
        </SettingsGroupPart>
      </SettingsSection>
    </div>
  );
}
