import { useRef, useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button, Tag } from '@deepseek-ai/dsh-client-ui-primitives';

import type {
  MarketplaceAuthoredBot,
  MarketplaceEntry,
} from '../../../core/src/marketplace/client.js';
import type { BridgeActions } from './actions.js';
import type { DockPanelRegistry } from './dock-panels.js';
import { EmptyState } from './ds/empty-state.js';
import { FormDialog } from './ds/form-dialog.js';
import { Note } from './ds/note.js';
import { PanelDialog } from './ds/panel-dialog.js';
import { color, radius, space, text } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import { MarketUploadDialog } from './market-upload.js';
import {
  fileSize,
  marketplaceError,
  marketplaceLanguage,
  marketplaceName,
  MarketplaceAvatar,
} from './marketplace.js';
import { useMountedResource } from './mounted-resource.js';

const styles = stylex.create({
  list: { display: 'flex', flexDirection: 'column', gap: space.x3, minWidth: 0 },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x4,
    padding: space.x4,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    minWidth: 0,
  },
  copy: { display: 'flex', flexDirection: 'column', gap: space.x1, flexGrow: 1, minWidth: 0 },
  name: {
    color: color.fg,
    fontSize: text.titleSize,
    lineHeight: text.titleLine,
    fontWeight: text.strong,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  meta: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.x2,
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
  },
  actions: { display: 'flex', flexShrink: 0, gap: space.x2 },
});

function day(iso: string): string {
  return iso.slice(0, 10);
}

type ListState =
  | { status: 'loading' }
  | { status: 'error'; cause: unknown }
  | { status: 'ready'; bots: MarketplaceAuthoredBot[] };

type Screen =
  | { kind: 'list' }
  | { kind: 'update'; item: MarketplaceAuthoredBot }
  | { kind: 'delete'; item: MarketplaceAuthoredBot };

export function MyUploadsDialog({
  actions,
  registry,
  t,
  onUpdated,
  onDeleted,
  onClose,
}: {
  actions: BridgeActions;
  registry: DockPanelRegistry;
  t: BotHarnessTranslate;
  onUpdated: (bot: MarketplaceEntry) => void;
  onDeleted: (id: string) => void;
  onClose: () => void;
}): ReactElement {
  const [list, setList] = useState<ListState>({ status: 'loading' });
  const [screen, setScreen] = useState<Screen>({ kind: 'list' });
  const [busy, setBusy] = useState(false);
  const [cause, setCause] = useState<unknown>();
  const mounted = useRef(true);

  const load = (): void => {
    void actions.marketplaceMine(marketplaceLanguage(t)).then(
      (loaded) => {
        if (mounted.current) setList({ status: 'ready', bots: loaded });
      },
      (failure: unknown) => {
        if (mounted.current) setList({ status: 'error', cause: failure });
      },
    );
  };

  const mount = useMountedResource<HTMLSpanElement>(() => {
    mounted.current = true;
    load();
    return () => {
      mounted.current = false;
    };
  }, []);

  const go = (next: Screen): void => {
    setCause(undefined);
    setScreen(next);
  };

  const remove = async (item: MarketplaceAuthoredBot): Promise<void> => {
    setBusy(true);
    setCause(undefined);
    try {
      await actions.marketplaceDelete(item.bot.id);
      if (!mounted.current) return;
      onDeleted(item.bot.id);
      setList((current) =>
        current.status === 'ready'
          ? { ...current, bots: current.bots.filter((entry) => entry !== item) }
          : current,
      );
      setScreen({ kind: 'list' });
    } catch (failure) {
      if (mounted.current) setCause(failure);
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const view = (): ReactElement => {
    if (screen.kind === 'update')
      return (
        <MarketUploadDialog
          actions={actions}
          registry={registry}
          t={t}
          replacing={screen.item.bot}
          onListed={(bot) => {
            onUpdated(bot);
            load();
          }}
          onClose={() => go({ kind: 'list' })}
        />
      );

    if (screen.kind === 'delete') {
      const { item } = screen;
      return (
        <FormDialog
          title={t('market.mine.deleteTitle', { name: marketplaceName(item.bot) })}
          size="small"
          labels={{ close: t('common.close'), cancel: t('common.cancel') }}
          submitLabel={t('market.mine.deleteConfirm')}
          busy={busy}
          danger
          error={
            cause === undefined ? undefined : (
              <Note tone="danger">{marketplaceError(cause, t)}</Note>
            )
          }
          onCancel={() => go({ kind: 'list' })}
          onSubmit={() => void remove(item)}
        >
          <Note>{t('market.mine.deleteBody')}</Note>
        </FormDialog>
      );
    }

    return (
      <PanelDialog
        size="small"
        onClose={onClose}
        closeLabel={t('common.close')}
        title={t('market.mine.title')}
        scroll
        data={{ 'data-market-mine': 'list' }}
      >
        {list.status === 'loading' ? (
          <Note>{t('market.mine.loading')}</Note>
        ) : list.status === 'error' ? (
          <Note tone="danger">{marketplaceError(list.cause, t)}</Note>
        ) : list.bots.length === 0 ? (
          <EmptyState title={t('market.mine.empty')} />
        ) : (
          <div {...stylex.props(styles.list)} role="list" aria-label={t('market.mine.title')}>
            {list.bots.map((item) => (
              <div
                key={item.bot.id}
                {...stylex.props(styles.row)}
                role="listitem"
                data-market-mine-bot={item.bot.id}
              >
                <MarketplaceAvatar bot={item.bot} size={40} t={t} />
                <span {...stylex.props(styles.copy)}>
                  <span {...stylex.props(styles.name)}>{marketplaceName(item.bot)}</span>
                  <span {...stylex.props(styles.meta)}>
                    {item.blocked ? <Tag tone="warning">{t('market.mine.blocked')}</Tag> : null}
                    <span>
                      {t('market.mine.meta', {
                        count: String(item.files),
                        size: fileSize(item.bytes),
                        date: day(item.bot.pushedAt),
                      })}
                    </span>
                  </span>
                </span>
                <span {...stylex.props(styles.actions)}>
                  <Button
                    size="sm"
                    variant="outline"
                    aria-label={t('market.mine.updateLabel', { name: marketplaceName(item.bot) })}
                    onClick={() => go({ kind: 'update', item })}
                  >
                    {t('market.mine.update')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={t('market.mine.deleteLabel', { name: marketplaceName(item.bot) })}
                    onClick={() => go({ kind: 'delete', item })}
                  >
                    {t('market.mine.delete')}
                  </Button>
                </span>
              </div>
            ))}
          </div>
        )}
      </PanelDialog>
    );
  };

  return (
    <>
      <span ref={mount} hidden />
      {view()}
    </>
  );
}
