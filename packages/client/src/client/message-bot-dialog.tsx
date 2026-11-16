import { useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Input } from '@deepseek-ai/dsh-client-ui-primitives';

import type { BridgeCall } from './bridge.js';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import { EmptyState } from './ds/empty-state.js';
import { FormDialog } from './ds/form-dialog.js';
import { Note } from './ds/note.js';
import { color, radius, size, space, text } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import { loadReachableBots, type ReachableBot } from './team-bots-bridge.js';

const styles = stylex.create({
  list: {
    display: 'flex',
    flexDirection: 'column',
    margin: 0,
    marginTop: space.x2,
    padding: 0,
    listStyle: 'none',
    minWidth: 0,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x3,
    width: '100%',
    minHeight: size.row,
    paddingBlock: space.x2,
    paddingInline: space.x2,
    borderWidth: 0,
    borderStyle: 'none',
    borderRadius: radius.sm,
    backgroundColor: { default: 'transparent', ':hover': color.hover },
    color: color.fg,
    fontFamily: 'inherit',
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
    textAlign: 'start',
    cursor: 'pointer',
  },
  icon: { display: 'inline-flex', flexShrink: 0, color: color.muted },
  meta: { flexShrink: 0, color: color.muted, fontSize: text.metaSize, lineHeight: text.metaLine },
  name: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
});

type Load =
  | { state: 'loading' }
  | { state: 'failed' }
  | { state: 'ready'; bots: readonly ReachableBot[] };

export function filterBots(bots: readonly ReachableBot[], query: string): ReachableBot[] {
  const needle = query.trim().toLowerCase();
  return needle.length === 0
    ? [...bots]
    : bots.filter(
        (bot) =>
          bot.displayName.toLowerCase().includes(needle) ||
          bot.principalDisplayName.toLowerCase().includes(needle),
      );
}

export function MessageBotDialog({
  call,
  t,
  onClose,
  onOpen,
}: {
  call: BridgeCall;
  t: BotHarnessTranslate;
  onClose(): void;
  onOpen(bot: ReachableBot): void;
}): ReactElement {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [query, setQuery] = useState('');
  const mount = useMountedResource<HTMLDivElement>(() => {
    const controller = new AbortController();
    loadReachableBots(call, controller.signal)
      .then((bots) => {
        if (!controller.signal.aborted)
          setLoad({ state: 'ready', bots: bots.filter((bot) => bot.visibility === 'public') });
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoad({ state: 'failed' });
      });
    return () => controller.abort();
  }, [call]);
  const bots = load.state === 'ready' ? filterBots(load.bots, query) : [];
  return (
    <FormDialog
      title={t('team.bots.title')}
      size="medium"
      labels={{ close: t('common.close'), cancel: t('common.close') }}
      submitLabel=""
      onCancel={onClose}
      onClose={onClose}
      showCancel={false}
      scroll
    >
      <div ref={mount}>
        {load.state === 'loading' ? (
          <Note>{t('team.bots.loading')}</Note>
        ) : load.state === 'failed' ? (
          <Note tone="danger">{t('team.bots.loadFailed')}</Note>
        ) : load.bots.length === 0 ? (
          <EmptyState title={t('team.bots.empty')} />
        ) : (
          <>
            <Input
              value={query}
              placeholder={t('team.bots.search')}
              aria-label={t('team.bots.search')}
              autoFocus
              onChange={(event) => setQuery(event.currentTarget.value)}
            />
            {bots.length === 0 ? (
              <Note>{t('team.dm.noMatch')}</Note>
            ) : (
              <ul {...stylex.props(styles.list)} aria-label={t('team.bots.title')}>
                {bots.map((bot) => (
                  <li key={bot.slug} data-team-bot={bot.slug}>
                    <button type="button" onClick={() => onOpen(bot)} {...stylex.props(styles.row)}>
                      <span {...stylex.props(styles.icon)}>
                        <ChannelSidebarIcon name="bot" size={16} />
                      </span>
                      <span {...stylex.props(styles.name)}>{bot.displayName}</span>
                      <span {...stylex.props(styles.meta)}>
                        {t('team.bots.sharedBy', { name: bot.principalDisplayName })}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </FormDialog>
  );
}
