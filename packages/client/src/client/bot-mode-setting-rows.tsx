import { SegmentedControl } from './ds/segmented.js';
import { Switch } from './ds/switch.js';
import type { ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';

import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';

import {
  isBotModeMotionPreference,
  isBotModeSendKey,
  isBotModeSortMode,
  isSessionCollapseMode,
  isSessionDetailLevel,
  isSessionFoldedReplies,
  SESSION_COLLAPSE_MODES,
  SESSION_DETAIL_LEVELS,
  SESSION_FOLDED_REPLIES,
  type BotModeIcon,
  type BotModeMotionPreference,
  type BotModeSendKey,
  type BotModeSortMode,
} from '@botharness/host-client/shared/bot-mode-settings';
import { BotHopLimitSetting } from './bot-hop-limit-setting.js';
import { AssignmentConcurrencySetting } from './assignment-concurrency-setting.js';
import { BotIcon } from './bot-icon.js';
import type { BotModePrefsFace } from './bot-mode-prefs.js';
import { isApplePlatform, KeyCombo, type ShortcutKey } from './ds/kbd.js';
import { Select } from './ds/select.js';
import { SettingsRow } from './ds/settings-row.js';
import { PreviewChoices } from './ds/preview-choice.js';
import {
  accent,
  ink,
  layer,
  motion,
  radius,
  size,
  space,
  style,
  type as text,
} from './ds/tobs.stylex.js';
import type { BotHarnessKey } from './locale.js';

export type BotModeSettingRowProps = PropsLocale<'botharness'> & InjectFace<BotModePrefsFace>;

const SORT_OPTIONS: readonly { id: BotModeSortMode; label: BotHarnessKey }[] = [
  { id: 'updated', label: 'sort.updated' },
  { id: 'manual', label: 'sort.manual' },
];

const ICON_OPTIONS: readonly { id: BotModeIcon; label: BotHarnessKey }[] = [
  { id: 'mascot', label: 'icon.mascot' },
  { id: 'simple', label: 'icon.simple' },
  { id: 'blob', label: 'icon.blob' },
  { id: 'bot', label: 'icon.bot' },
];

const MOTION_OPTIONS: readonly {
  id: BotModeMotionPreference;
  label: BotHarnessKey;
}[] = [
  { id: 'system', label: 'motion.system' },
  { id: 'reduce', label: 'motion.reduce' },
  { id: 'full', label: 'motion.full' },
];

const SEND_KEY_OPTIONS: readonly {
  id: BotModeSendKey;
  send: readonly ShortcutKey[];
  newline: readonly ShortcutKey[];
}[] = [
  { id: 'enter', send: ['Enter'], newline: ['Shift', 'Enter'] },
  { id: 'shift-enter', send: ['Shift', 'Enter'], newline: ['Enter'] },
  { id: 'mod-enter', send: ['Mod', 'Enter'], newline: ['Enter'] },
];

const motionSample = stylex.keyframes({
  '0%, 70%, 100%': { opacity: 0.4, transform: 'translateY(0)' },
  '35%': { opacity: 1, transform: `translateY(-${space.x1})` },
});

const styles = stylex.create({
  motionPreview: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: space.x3,
    width: 'fit-content',
    minHeight: size.controlSmall,
    marginTop: space.x2,
    paddingBlock: space.x1,
    paddingInline: space.x3,
    borderRadius: style.radiusContainer,
    backgroundColor: layer.well,
    color: ink.secondary,
    fontSize: text.captionSize,
  },
  motionSample: { display: 'inline-flex', alignItems: 'center', gap: space.x2 },
  motionDot: {
    width: space.x2,
    height: space.x2,
    borderRadius: radius.full,
    backgroundColor: accent.solid,
    opacity: 0.45,
  },
  animatedDot: (index: number) => ({
    animationName: motionSample,
    animationDuration: '1100ms',
    animationTimingFunction: motion.standard,
    animationIterationCount: 'infinite',
    animationDelay: `${index * 130}ms`,
  }),
  sendKey: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: space.x2,
    flexWrap: 'wrap',
  },
  sendKeySeparator: {
    color: ink.secondary,
  },
});

export function BotIconSetting({
  t,
  useBotModePrefs,
  setBotIcon,
}: BotModeSettingRowProps): ReactElement {
  const botIcon = useBotModePrefs((value) => value.botIcon);
  return (
    <SettingsRow title={t('icon.row.title')} description={t('icon.row.description')}>
      <PreviewChoices
        label={t('icon.row.title')}
        variant="icon"
        value={botIcon}
        onChange={setBotIcon}
        options={ICON_OPTIONS.map((option) => ({
          id: option.id,
          label: t(option.label),
          preview: <BotIcon icon={option.id} size={28} />,
        }))}
      />
    </SettingsRow>
  );
}

export function MotionSetting({
  t,
  useBotModePrefs,
  setMotionPreference,
}: BotModeSettingRowProps): ReactElement {
  const prefs = useBotModePrefs((value) => value);
  const effectiveLabel: BotHarnessKey =
    prefs.effectiveMotion === 'reduce' ? 'motion.preview.reduce' : 'motion.preview.full';
  const memoryOnly = prefs.status === 'unavailable' && prefs.mode === 'memory';
  return (
    <SettingsRow
      title={t('motion.row.title')}
      description={t(memoryOnly ? 'motion.row.memory' : 'motion.row.description')}
      data={{ 'data-setting': 'motion' }}
      control={
        <SegmentedControl
          id="bh-motion-preference"
          label={t('motion.menu.label')}
          value={prefs.motionPreference}
          options={MOTION_OPTIONS.map((option) => ({
            value: option.id,
            label: t(option.label),
          }))}
          onChange={(id) => {
            if (isBotModeMotionPreference(id)) setMotionPreference(id);
          }}
        />
      }
    >
      <div role="status" aria-live="polite" {...stylex.props(styles.motionPreview)}>
        <span aria-hidden="true" {...stylex.props(styles.motionSample)}>
          {[0, 1, 2].map((index) => (
            <span
              key={index}
              {...stylex.props(
                styles.motionDot,
                prefs.effectiveMotion === 'full' && styles.animatedDot(index),
              )}
            />
          ))}
        </span>
        <span>
          {t('motion.preview.label')} · {t(effectiveLabel)}
        </span>
      </div>
    </SettingsRow>
  );
}

export function SortSetting({
  t,
  useBotModePrefs,
  setSortMode,
}: BotModeSettingRowProps): ReactElement {
  const prefs = useBotModePrefs((value) => value);
  const memoryOnly = prefs.status === 'unavailable' && prefs.mode === 'memory';
  return (
    <SettingsRow
      title={t('sort.row.title')}
      description={t(memoryOnly ? 'sort.row.memory' : 'sort.row.description')}
      control={
        <Select
          label={t('sort.menu.label')}
          value={prefs.sortMode}
          options={SORT_OPTIONS.map((option) => ({
            value: option.id,
            label: t(option.label),
          }))}
          onChange={(id) => {
            if (isBotModeSortMode(id)) setSortMode(id);
          }}
        />
      }
    />
  );
}

export function SendKeySetting({
  t,
  useBotModePrefs,
  setSendKey,
  apple = isApplePlatform(),
}: BotModeSettingRowProps & { apple?: boolean }): ReactElement {
  const sendKey = useBotModePrefs((value) => value.sendKey);
  return (
    <SettingsRow
      title={t('sendKey.row.title')}
      description={t('sendKey.row.description')}
      data={{ 'data-setting': 'send-key' }}
      control={
        <Select
          label={t('sendKey.row.title')}
          value={sendKey}
          options={SEND_KEY_OPTIONS.map((option) => ({
            value: option.id,
            label: (
              <span data-send-key={option.id} {...stylex.props(styles.sendKey)}>
                <KeyCombo keys={option.send} apple={apple} />
                <span>{t('shortcuts.send')}</span>
                <span {...stylex.props(styles.sendKeySeparator)}>·</span>
                <KeyCombo keys={option.newline} apple={apple} />
                <span>{t('shortcuts.newline')}</span>
              </span>
            ),
          }))}
          onChange={(id) => {
            if (isBotModeSendKey(id)) setSendKey(id);
          }}
        />
      }
    />
  );
}

export function AutoCollapseMessagesSetting({
  t,
  useBotModePrefs,
  setAutoCollapseMessages,
}: BotModeSettingRowProps): ReactElement {
  const enabled = useBotModePrefs((value) => value.autoCollapseMessages);
  return (
    <SettingsRow
      title={t('messageFold.row.title')}
      description={t('messageFold.row.description')}
      control={
        <Switch
          checked={enabled}
          onChange={setAutoCollapseMessages}
          label={t('messageFold.row.title')}
        />
      }
    />
  );
}

export function DmAvatarSetting({
  t,
  useBotModePrefs,
  setShowDmAvatar,
}: BotModeSettingRowProps): ReactElement {
  const enabled = useBotModePrefs((value) => value.showDmAvatar);
  return (
    <SettingsRow
      title={t('message.avatar.dm.row.title')}
      description={t('message.avatar.dm.row.description')}
      control={
        <Switch
          checked={enabled}
          onChange={setShowDmAvatar}
          label={t('message.avatar.dm.row.title')}
        />
      }
    />
  );
}

export function OwnAvatarSetting({
  t,
  useBotModePrefs,
  setShowOwnAvatar,
}: BotModeSettingRowProps): ReactElement {
  const enabled = useBotModePrefs((value) => value.showOwnAvatar);
  return (
    <SettingsRow
      title={t('message.avatar.own.row.title')}
      description={t('message.avatar.own.row.description')}
      control={
        <Switch
          checked={enabled}
          onChange={setShowOwnAvatar}
          label={t('message.avatar.own.row.title')}
        />
      }
    />
  );
}

export function DeliveryReceiptsSetting({
  t,
  useBotModePrefs,
  setShowDeliveryReceipts,
}: BotModeSettingRowProps): ReactElement {
  const enabled = useBotModePrefs((value) => value.showDeliveryReceipts);
  return (
    <SettingsRow
      title={t('message.delivery.row.title')}
      description={t('message.delivery.row.description')}
      control={
        <Switch
          checked={enabled}
          onChange={setShowDeliveryReceipts}
          label={t('message.delivery.row.title')}
        />
      }
    />
  );
}

export function StreamRepliesSetting({
  t,
  useBotModePrefs,
  setStreamReplies,
}: BotModeSettingRowProps): ReactElement {
  const enabled = useBotModePrefs((value) => value.streamReplies);
  return (
    <SettingsRow
      title={t('message.stream.row.title')}
      description={t('message.stream.row.description')}
      control={
        <Switch
          checked={enabled}
          onChange={setStreamReplies}
          label={t('message.stream.row.title')}
        />
      }
    />
  );
}

export function DeveloperModeSetting({
  t,
  useBotModePrefs,
  setDeveloperMode,
}: BotModeSettingRowProps): ReactElement {
  const prefs = useBotModePrefs((value) => value);
  return (
    <SettingsRow
      title={t('developer.row.title')}
      description={t('developer.row.description')}
      control={
        <Switch
          checked={prefs.developerMode}
          onChange={setDeveloperMode}
          label={t('developer.row.title')}
        />
      }
    />
  );
}

export function BotSessionsVisibilitySetting({
  t,
  useBotModePrefs,
  setShowBotSessions,
}: BotModeSettingRowProps): ReactElement {
  const prefs = useBotModePrefs((value) => value);
  return (
    <SettingsRow
      title={t('botSessions.row.title')}
      description={t('botSessions.row.description')}
      info={{ label: t('botSessions.row.title'), text: t('botSessions.row.info') }}
      control={
        <Switch
          checked={prefs.showBotSessions}
          onChange={setShowBotSessions}
          label={t('botSessions.row.title')}
        />
      }
    />
  );
}

export function ApprovalReviewSessionsVisibilitySetting({
  t,
  useBotModePrefs,
  setShowApprovalReviewSessions,
}: BotModeSettingRowProps): ReactElement {
  const shown = useBotModePrefs((value) => value.showApprovalReviewSessions);
  return (
    <SettingsRow
      title={t('approvalReviewSessions.row.title')}
      description={t('approvalReviewSessions.row.description')}
      info={{
        label: t('approvalReviewSessions.row.title'),
        text: t('approvalReviewSessions.row.info'),
      }}
      control={
        <Switch
          checked={shown}
          onChange={setShowApprovalReviewSessions}
          label={t('approvalReviewSessions.row.title')}
        />
      }
    />
  );
}

export function GroupAutoAcceptSetting({
  t,
  useBotModePrefs,
  setAutoAcceptGroupInvites,
}: BotModeSettingRowProps): ReactElement {
  const prefs = useBotModePrefs((value) => value);
  return (
    <SettingsRow
      title={t('groupAutoAccept.row.title')}
      description={t('groupAutoAccept.row.description')}
      control={
        <Switch
          checked={prefs.autoAcceptGroupInvites}
          onChange={setAutoAcceptGroupInvites}
          disabled={prefs.status !== 'ready' || prefs.mode !== 'host'}
          label={t('groupAutoAccept.row.title')}
        />
      }
    />
  );
}

export function BotHopLimitRow({
  t,
  useBotModePrefs,
  setBotHopLimit,
}: BotModeSettingRowProps): ReactElement {
  const prefs = useBotModePrefs((value) => value);
  return (
    <BotHopLimitSetting
      t={t}
      limit={prefs.botHopLimit}
      writable={prefs.status === 'ready' && prefs.mode === 'host'}
      save={setBotHopLimit}
    />
  );
}

export function AssignmentConcurrencyRow({
  t,
  useBotModePrefs,
  setAssignmentConcurrencyLimit,
}: BotModeSettingRowProps): ReactElement {
  const prefs = useBotModePrefs((value) => value);
  return (
    <AssignmentConcurrencySetting
      t={t}
      limit={prefs.assignmentConcurrencyLimit}
      writable={prefs.status === 'ready' && prefs.mode === 'host'}
      save={setAssignmentConcurrencyLimit}
    />
  );
}

export function SessionDetailLevelSetting({
  t,
  useBotModePrefs,
  setSessionDetailLevel,
}: BotModeSettingRowProps): ReactElement {
  const level = useBotModePrefs((value) => value.sessionDetailLevel);
  return (
    <SettingsRow
      title={t('sessions.settings.level.title')}
      description={t('sessions.settings.level.description')}
      data={{ 'data-setting': 'session-detail-level' }}
      control={
        <Select
          label={t('sessions.settings.level.title')}
          value={level}
          options={SESSION_DETAIL_LEVELS.map((id) => ({
            value: id,
            label: t(`sessions.settings.level.${id}`),
          }))}
          onChange={(id) => {
            if (isSessionDetailLevel(id)) setSessionDetailLevel(id);
          }}
        />
      }
    />
  );
}

export function SessionCollapseSetting({
  t,
  useBotModePrefs,
  setSessionCollapse,
}: BotModeSettingRowProps): ReactElement {
  const mode = useBotModePrefs((value) => value.sessionCollapse);
  return (
    <SettingsRow
      title={t('sessions.settings.collapse.title')}
      data={{ 'data-setting': 'session-collapse' }}
      control={
        <Select
          label={t('sessions.settings.collapse.title')}
          value={mode}
          options={SESSION_COLLAPSE_MODES.map((id) => ({
            value: id,
            label: t(`sessions.settings.collapse.${id}`),
          }))}
          onChange={(id) => {
            if (isSessionCollapseMode(id)) setSessionCollapse(id);
          }}
        />
      }
    />
  );
}

export function SessionFoldedRepliesSetting({
  t,
  useBotModePrefs,
  setSessionFoldedReplies,
}: BotModeSettingRowProps): ReactElement {
  const mode = useBotModePrefs((value) => value.sessionFoldedReplies);
  return (
    <SettingsRow
      title={t('sessions.settings.replies.title')}
      data={{ 'data-setting': 'session-folded-replies' }}
      control={
        <Select
          label={t('sessions.settings.replies.title')}
          value={mode}
          options={SESSION_FOLDED_REPLIES.map((id) => ({
            value: id,
            label: t(`sessions.settings.replies.${id}`),
          }))}
          onChange={(id) => {
            if (isSessionFoldedReplies(id)) setSessionFoldedReplies(id);
          }}
        />
      }
    />
  );
}
