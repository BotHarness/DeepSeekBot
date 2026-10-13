import { useState, type ReactElement } from 'react';

import { IconChevronDownOutlineRegular, Menu, Switch } from '@deepseek-ai/dsh-client-ui-primitives';
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';

import {
  isBotModeIcon,
  isBotModeMotionPreference,
  isBotModeSortMode,
  type BotModeIcon,
  type BotModeMotionPreference,
  type BotModeSortMode,
} from '../bot-mode-settings.js';
import { AssignmentConcurrencySetting } from './assignment-concurrency-setting.js';
import { BotIcon } from './bot-icon.js';
import type { BotModePrefsFace } from './bot-mode-prefs.js';
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
      className="bh-icon-card"
      data-selected={selected ? 'true' : undefined}
      onClick={() => {
        onSelect(option);
      }}
    >
      <BotIcon icon={option} size={40} className="bh-icon-card-art" />
      <span className="bh-icon-card-label">{label}</span>
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
    <>
      <div className="bh-settings-row bh-icon-row">
        <div className="bh-settings-row-text">
          <div className="bh-settings-row-title">{t('icon.row.title')}</div>
          <div className="bh-settings-row-desc">{t('icon.row.description')}</div>
        </div>
      </div>
      <div className="bh-icon-grid" role="radiogroup" aria-label={t('icon.row.title')}>
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
    </>
  );
}

export function MotionSetting({
  t,
  useBotModePrefs,
  setMotionPreference,
}: BotModeSettingRowProps): ReactElement {
  const prefs = useBotModePrefs((value) => value);
  const [motionOpen, setMotionOpen] = useState(false);
  const motionLabel: BotHarnessKey =
    prefs.motionPreference === 'reduce'
      ? 'motion.reduce'
      : prefs.motionPreference === 'full'
        ? 'motion.full'
        : 'motion.system';
  const effectiveLabel: BotHarnessKey =
    prefs.effectiveMotion === 'reduce' ? 'motion.preview.reduce' : 'motion.preview.full';
  const memoryOnly = prefs.status === 'unavailable' && prefs.mode === 'memory';
  return (
    <div className="bh-settings-row bh-motion-row">
      <div className="bh-settings-row-text">
        <div className="bh-settings-row-title">{t('motion.row.title')}</div>
        <div className="bh-settings-row-desc">
          {t(memoryOnly ? 'motion.row.memory' : 'motion.row.description')}
        </div>
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
      </div>
      <Menu
        open={motionOpen}
        portal
        align="end"
        items={MOTION_OPTIONS.map((option) => ({ id: option.id, label: t(option.label) }))}
        selectedId={prefs.motionPreference}
        onSelect={(id) => {
          setMotionOpen(false);
          if (isBotModeMotionPreference(id)) setMotionPreference(id);
        }}
        onClose={() => {
          setMotionOpen(false);
        }}
        anchor={
          <button
            type="button"
            className="bh-settings-selector"
            aria-label={t('motion.menu.label')}
            aria-haspopup="menu"
            aria-expanded={motionOpen}
            onClick={() => {
              setMotionOpen((value) => !value);
            }}
          >
            {t(motionLabel)}
            <IconChevronDownOutlineRegular className="bh-settings-chevron" />
          </button>
        }
      />
    </div>
  );
}

export function SortSetting({
  t,
  useBotModePrefs,
  setSortMode,
}: BotModeSettingRowProps): ReactElement {
  const prefs = useBotModePrefs((value) => value);
  const [sortOpen, setSortOpen] = useState(false);
  const sortLabel: BotHarnessKey = prefs.sortMode === 'manual' ? 'sort.manual' : 'sort.updated';
  const memoryOnly = prefs.status === 'unavailable' && prefs.mode === 'memory';
  return (
    <div className="bh-settings-row bh-sort-row">
      <div className="bh-settings-row-text">
        <div className="bh-settings-row-title">{t('sort.row.title')}</div>
        <div className="bh-settings-row-desc">
          {t(memoryOnly ? 'sort.row.memory' : 'sort.row.description')}
        </div>
      </div>
      <Menu
        open={sortOpen}
        portal
        align="end"
        items={SORT_OPTIONS.map((option) => ({ id: option.id, label: t(option.label) }))}
        selectedId={prefs.sortMode}
        onSelect={(id) => {
          setSortOpen(false);
          if (isBotModeSortMode(id)) setSortMode(id);
        }}
        onClose={() => {
          setSortOpen(false);
        }}
        anchor={
          <button
            type="button"
            className="bh-settings-selector"
            aria-label={t('sort.menu.label')}
            aria-haspopup="menu"
            aria-expanded={sortOpen}
            onClick={() => {
              setSortOpen((value) => !value);
            }}
          >
            {t(sortLabel)}
            <IconChevronDownOutlineRegular className="bh-settings-chevron" />
          </button>
        }
      />
    </div>
  );
}

export function DeveloperModeSetting({
  t,
  useBotModePrefs,
  setDeveloperMode,
}: BotModeSettingRowProps): ReactElement {
  const prefs = useBotModePrefs((value) => value);
  return (
    <div className="bh-settings-row bh-developer-row">
      <div className="bh-settings-row-text">
        <div className="bh-settings-row-title">{t('developer.row.title')}</div>
        <div className="bh-settings-row-desc">{t('developer.row.description')}</div>
      </div>
      <Switch
        checked={prefs.developerMode}
        onChange={setDeveloperMode}
        label={t('developer.row.title')}
      />
    </div>
  );
}

export function BotSessionsVisibilitySetting({
  t,
  useBotModePrefs,
  setShowBotSessions,
}: BotModeSettingRowProps): ReactElement {
  const prefs = useBotModePrefs((value) => value);
  return (
    <div className="bh-settings-row bh-bot-sessions-row">
      <div className="bh-settings-row-text">
        <div className="bh-settings-row-title">{t('botSessions.row.title')}</div>
        <div className="bh-settings-row-desc">{t('botSessions.row.description')}</div>
      </div>
      <Switch
        checked={prefs.showBotSessions}
        onChange={setShowBotSessions}
        label={t('botSessions.row.title')}
      />
    </div>
  );
}

export function GroupAutoAcceptSetting({
  t,
  useBotModePrefs,
  setAutoAcceptGroupInvites,
}: BotModeSettingRowProps): ReactElement {
  const prefs = useBotModePrefs((value) => value);
  return (
    <div className="bh-settings-row bh-group-auto-accept-row">
      <div className="bh-settings-row-text">
        <div className="bh-settings-row-title">{t('groupAutoAccept.row.title')}</div>
        <div className="bh-settings-row-desc">{t('groupAutoAccept.row.description')}</div>
      </div>
      <Switch
        checked={prefs.autoAcceptGroupInvites}
        onChange={setAutoAcceptGroupInvites}
        disabled={prefs.status !== 'ready' || prefs.mode !== 'host'}
        label={t('groupAutoAccept.row.title')}
      />
    </div>
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
