import type { ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Modal } from './modal.js';
import { SidebarCardList, SidebarCardRow } from './sidebar-card.js';
import { border, color, dialog, radius, size, space, text } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';

const styles = stylex.create({
  dialog: { width: dialog.small, maxWidth: '100%' },
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x5,
    maxHeight: dialog.bodyMax,
    overflowY: 'auto',
  },
  cards: { display: 'flex', flexDirection: 'column', gap: space.x3 },
  steps: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x3,
    listStyle: 'none',
    margin: 0,
    padding: 0,
  },
  step: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x3,
    color: color.muted,
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
  },
  current: { color: color.fg, fontWeight: text.strong },
  dot: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: size.inlineIcon,
    height: size.inlineIcon,
    borderRadius: radius.round,
    backgroundColor: color.surface,
  },
  active: { backgroundColor: color.accent, color: color.onAccent },
  line: { flexGrow: 1, height: border.hairline, backgroundColor: color.border },
  back: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: space.x3,
    padding: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    color: 'inherit',
    font: 'inherit',
    cursor: { default: 'pointer', ':disabled': 'default' },
    borderRadius: radius.sm,
    outline: { default: 'none', ':focus-visible': `${border.focus} solid ${color.accent}` },
  },
});

export function BotCreateSteps({
  t,
  onBack,
  disabled = false,
}: {
  t: BotHarnessTranslate;
  onBack?: (() => void) | undefined;
  disabled?: boolean;
}): ReactElement {
  return (
    <ol {...stylex.props(styles.steps)} aria-label={t('roster.menu.createBot')}>
      <li
        {...stylex.props(styles.step, !onBack && styles.current)}
        aria-current={!onBack ? 'step' : undefined}
      >
        <button
          type="button"
          disabled={!onBack || disabled}
          onClick={onBack}
          {...stylex.props(styles.back)}
        >
          <span {...stylex.props(styles.dot, !onBack && styles.active)}>1</span>
          {t('bot.create.source.step')}
        </button>
      </li>
      <li role="presentation" aria-hidden="true" {...stylex.props(styles.line)} />
      <li
        {...stylex.props(styles.step, !!onBack && styles.current)}
        aria-current={onBack ? 'step' : undefined}
      >
        <span {...stylex.props(styles.dot, !!onBack && styles.active)}>2</span>
        {t('bot.create.source.details')}
      </li>
    </ol>
  );
}

export function BotCreateSourceModal({
  t,
  member,
  localImports,
  onSelect,
  onClose,
}: {
  t: BotHarnessTranslate;
  member: boolean;
  localImports: boolean;
  onSelect: (source: 'empty' | 'git' | 'zip') => void;
  onClose: () => void;
}): ReactElement {
  return (
    <Modal
      open
      title={t('roster.menu.createBot')}
      description={t('bot.create.source.description')}
      closeLabel={t('common.close')}
      onClose={onClose}
      className={stylex.props(styles.dialog).className ?? ''}
    >
      <div className="bh-root" {...stylex.props(styles.body)}>
        <BotCreateSteps t={t} />
        <div {...stylex.props(styles.cards)}>
          <SidebarCardList>
            <SidebarCardRow
              icon="plus"
              title={t('roster.menu.createBot.empty')}
              meta={t('bot.create.source.empty')}
              onClick={() => onSelect('empty')}
            />
          </SidebarCardList>
          {!member ? (
            <>
              <SidebarCardList>
                <SidebarCardRow
                  icon="git-branch"
                  title={t('roster.menu.createBot.git')}
                  meta={t('bot.create.source.git')}
                  onClick={() => onSelect('git')}
                />
              </SidebarCardList>
              <SidebarCardList>
                <SidebarCardRow
                  icon="archive-restore"
                  title={t('roster.menu.createBot.zip')}
                  meta={t(localImports ? 'bot.create.source.zip' : 'environment.create.localOnly')}
                  disabled={!localImports}
                  onClick={() => onSelect('zip')}
                />
              </SidebarCardList>
            </>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
