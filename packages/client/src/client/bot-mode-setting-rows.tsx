import type { ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';

import { Switch } from '@deepseek-ai/dsh-client-ui-primitives';
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';

import {
  isBotModeMotionPreference,
  isBotModeSortMode,
  type BotModeIcon,
  type BotModeMotionPreference,
  type BotModeSortMode,
} from '../bot-mode-settings.js';
import { AssignmentConcurrencySetting } from './assignment-concurrency-setting.js';
import { BotIcon } from './bot-icon.js';
import type { BotModePrefsFace } from './bot-mode-prefs.js';
import { Select } from './ds/select.js';
import { SettingsRow } from './ds/settings-row.js';
import { color, radius, space, text } from './ds/tokens.stylex.js';
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

const MOTION_OPTIONS: readonly { id: BotModeMotionPreference; label: BotHarnessKey }[] = [
  { id: 'system', label: 'motion.system' },
  { id: 'reduce', label: 'motion.reduce' },
  { id: 'full', label: 'motion.full' },
];

const styles = stylex.create({
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(112px, 1fr))',
    gap: space.x3,
    marginTop: space.x3,
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: space.x2,
    minWidth: 0,
    paddingBlock: space.x3,
    paddingInline: space.x2,
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: { default: color.border, ':is([aria-checked=true])': color.accent },
    borderRadius: radius.card,
    backgroundColor: {
      default: 'transparent',
      ':hover': color.hover,
      ':is([aria-checked=true])': color.selected,
    },
    color: { default: color.muted, ':hover': color.fg, ':is([aria-checked=true])': color.fg },
    fontFamily: 'inherit',
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    cursor: 'pointer',
    outline: { default: 'none', ':focus-visible': `2px solid ${color.accent}` },
  },
  art: {
    pointerEvents: 'none',
  },
  cardLabel: {
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
});

export function BotIconCard({
  option,
  label,
  selected,
  onSelect,
}: {
  readonly option: BotModeIcon;
  readonly label: string;
  readonly selected: boolean;
  readonly onSelect: (icon: BotModeIcon) => void;
}): ReactElement {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={() => {
        onSelect(option);
      }}
      {...stylex.props(styles.card)}
    >
      <span {...stylex.props(styles.art)}>
        <BotIcon icon={option} size={28} />
      </span>
      <span {...stylex.props(styles.cardLabel)}>{label}</span>
    </button>
  );
}

export function BotIconSetting({
  t,
  useBotModePrefs,
  setBotIcon,
}: BotModeSettingRowProps): ReactElement {
  const botIcon = useBotModePrefs((value) => value.botIcon);
  return (
    <SettingsRow title={t('icon.row.title')} description={t('icon.row.description')}>
      <div role="radiogroup" aria-label={t('icon.row.title')} {...stylex.props(styles.grid)}>
        {ICON_OPTIONS.map((option) => (
          <BotIconCard
            key={option.id}
            option={option.id}
            label={t(option.label)}
            selected={botIcon === option.id}
            onSelect={setBotIcon}
          />
        ))}
      </div>
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
        <Select
          label={t('motion.menu.label')}
          value={prefs.motionPreference}
          options={MOTION_OPTIONS.map((option) => ({ value: option.id, label: t(option.label) }))}
          onChange={(id) => {
            if (isBotModeMotionPreference(id)) setMotionPreference(id);
          }}
        />
      }
    >
      <div className="bh-motion-preview" role="status" aria-live="polite">
        <span className="bh-motion-preview-sample" aria-hidden="true">
          <i />
          <i />
          <i />
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
          options={SORT_OPTIONS.map((option) => ({ value: option.id, label: t(option.label) }))}
          onChange={(id) => {
            if (isBotModeSortMode(id)) setSortMode(id);
          }}
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
