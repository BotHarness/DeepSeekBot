import { Tag } from './ds/tag.js';
import { Button } from './ds/button.js';
import { useRef, useState, type ReactElement, type ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';

import type {
  MarketplaceAuthoredBot,
  MarketplaceEntry,
} from '../../../core/src/marketplace/client.js';
import type { MarketplaceSkill } from '@botharness/host-protocol/marketplace-skill';
import type { BridgeActions } from './actions.js';
import { BridgeCallError } from './bridge.js';
import type { DockPanelRegistry } from './dock-panels.js';
import { EmptyState } from './ds/empty-state.js';
import { FormDialog } from './ds/form-dialog.js';
import { GroupHeading } from './ds/group-heading.js';
import { Note } from './ds/note.js';
import { PanelDialog } from './ds/panel-dialog.js';
import { SettingsRow } from './ds/settings-row.js';
import { color, radius, space, text } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import { MarketUploadDialog } from './market-upload.js';
import { fileSize } from './market-files.js';
import { MarketSkillReplaceDialog, skillFilesLabel } from './market-skill-publish.js';
import { installsLabel, SkillLogo } from './market-skills.js';
import {
  marketplaceError,
  marketplaceLanguage,
  marketplaceName,
  MarketplaceAvatar,
} from './marketplace.js';
import { useMountedResource } from './mounted-resource.js';

const styles = stylex.create({
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x3,
    minWidth: 0,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x4,
    padding: space.x4,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    minWidth: 0,
  },
  copy: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x1,
    flexGrow: 1,
    minWidth: 0,
  },
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

export type MarketUploadChange =
  | { kind: 'updated'; bot: MarketplaceEntry }
  | { kind: 'deleted'; id: string };

const uploadChangeListeners = new Set<(change: MarketUploadChange) => void>();

export function onMarketUploadChange(listener: (change: MarketUploadChange) => void): () => void {
  uploadChangeListeners.add(listener);
  return () => {
    uploadChangeListeners.delete(listener);
  };
}

function announceUploadChange(change: MarketUploadChange): void {
  for (const listener of uploadChangeListeners) listener(change);
}

export function MyUploadsSettingsRow({
  actions,
  t,
}: {
  actions: BridgeActions;
  t: BotHarnessTranslate;
}): ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <SettingsRow
      title={t('market.mine.title')}
      description={t('market.mine.settingsHint')}
      data={{ 'data-account-uploads': '' }}
      control={
        <>
          <Button
            variant="outline"
            size="sm"
            aria-haspopup="dialog"
            data-account-uploads-open=""
            onClick={() => setOpen(true)}
          >
            {t('market.mine.manage')}
          </Button>
          {open ? (
            <MyUploadsDialog
              actions={actions}
              t={t}
              onUpdated={(bot) => announceUploadChange({ kind: 'updated', bot })}
              onDeleted={(id) => announceUploadChange({ kind: 'deleted', id })}
              onClose={() => setOpen(false)}
            />
          ) : null}
        </>
      }
    />
  );
}

function day(iso: string): string {
  return iso.slice(0, 10);
}

type ListState =
  | { status: 'loading' }
  | { status: 'error'; cause: unknown }
  | { status: 'ready'; bots: MarketplaceAuthoredBot[] };

type SkillListState =
  | { status: 'loading' }
  | { status: 'hidden' }
  | { status: 'error'; cause: unknown }
  | { status: 'ready'; skills: MarketplaceSkill[] };

type Screen =
  | { kind: 'list' }
  | { kind: 'update'; item: MarketplaceAuthoredBot }
  | { kind: 'delete'; item: MarketplaceAuthoredBot }
  | { kind: 'skill-replace'; skill: MarketplaceSkill }
  | { kind: 'skill-delete'; skill: MarketplaceSkill };

export function MyUploadsDialog({
  actions,
  registry,
  t,
  onUpdated,
  onDeleted,
  onClose,
}: {
  actions: BridgeActions;
  registry?: DockPanelRegistry | undefined;
  t: BotHarnessTranslate;
  onUpdated: (bot: MarketplaceEntry) => void;
  onDeleted: (id: string) => void;
  onClose: () => void;
}): ReactElement {
  const [list, setList] = useState<ListState>({ status: 'loading' });
  const [skills, setSkills] = useState<SkillListState>({ status: 'loading' });
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

  const loadSkills = (): void => {
    void actions.marketplaceSkillMine().then(
      (loaded) => {
        if (mounted.current) setSkills({ status: 'ready', skills: loaded.skills });
      },
      (failure: unknown) => {
        if (!mounted.current) return;
        setSkills(
          failure instanceof BridgeCallError && failure.code === 'permission-required'
            ? { status: 'hidden' }
            : { status: 'error', cause: failure },
        );
      },
    );
  };

  const mount = useMountedResource<HTMLSpanElement>(() => {
    mounted.current = true;
    load();
    loadSkills();
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
      onDeleted(item.bot.id);
      if (!mounted.current) return;
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

  const removeSkill = async (skill: MarketplaceSkill): Promise<void> => {
    setBusy(true);
    setCause(undefined);
    try {
      await actions.marketplaceSkillDelete(skill.id);
      if (!mounted.current) return;
      setSkills((current) =>
        current.status === 'ready'
          ? { ...current, skills: current.skills.filter(({ id }) => id !== skill.id) }
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
    if (screen.kind === 'skill-replace')
      return (
        <MarketSkillReplaceDialog
          actions={actions}
          skill={screen.skill}
          t={t}
          onReplaced={(next) =>
            setSkills((current) =>
              current.status === 'ready'
                ? {
                    ...current,
                    skills: current.skills.map((item) => (item.id === next.id ? next : item)),
                  }
                : current,
            )
          }
          onClose={() => go({ kind: 'list' })}
        />
      );

    if (screen.kind === 'skill-delete') {
      const { skill } = screen;
      return (
        <UploadDeleteDialog
          name={skill.name}
          body={t('market.skills.mine.deleteBody')}
          busy={busy}
          cause={cause}
          t={t}
          onCancel={() => go({ kind: 'list' })}
          onDelete={() => void removeSkill(skill)}
        />
      );
    }

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
        <UploadDeleteDialog
          name={marketplaceName(item.bot)}
          body={t('market.mine.deleteBody')}
          busy={busy}
          cause={cause}
          t={t}
          onCancel={() => go({ kind: 'list' })}
          onDelete={() => void remove(item)}
        />
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
        {skills.status === 'hidden' ? null : (
          <GroupHeading
            label={t('market.mine.bots')}
            count={list.status === 'ready' ? list.bots.length : ''}
            quiet
            flush
          />
        )}
        {list.status === 'loading' ? (
          <Note>{t('market.mine.loading')}</Note>
        ) : list.status === 'error' ? (
          <Note tone="danger">{marketplaceError(list.cause, t)}</Note>
        ) : list.bots.length === 0 ? (
          <EmptyState title={t('market.mine.empty')} />
        ) : (
          <MarketUploadList label={t('market.mine.title')}>
            {list.bots.map((item) => (
              <MarketUploadItem
                key={item.bot.id}
                data={{ 'data-market-mine-bot': item.bot.id }}
                image={<MarketplaceAvatar bot={item.bot} size={40} t={t} />}
                name={marketplaceName(item.bot)}
                meta={
                  <>
                    {item.blocked ? <Tag tone="warning">{t('market.mine.blocked')}</Tag> : null}
                    <span>
                      {t('market.mine.meta', {
                        count: String(item.files),
                        size: fileSize(item.bytes),
                        date: day(item.bot.pushedAt),
                      })}
                    </span>
                  </>
                }
                changeLabel={t('market.mine.update')}
                changeAriaLabel={t('market.mine.updateLabel', { name: marketplaceName(item.bot) })}
                onChange={() => go({ kind: 'update', item })}
                onDelete={() => go({ kind: 'delete', item })}
                t={t}
              />
            ))}
          </MarketUploadList>
        )}
        {skills.status === 'hidden' ? null : (
          <>
            <GroupHeading
              label={t('market.mine.skills')}
              count={skills.status === 'ready' ? skills.skills.length : ''}
              quiet
              flush
            />
            {skills.status === 'loading' ? (
              <Note>{t('market.mine.loading')}</Note>
            ) : skills.status === 'error' ? (
              <Note tone="danger">{marketplaceError(skills.cause, t)}</Note>
            ) : skills.skills.length === 0 ? (
              <EmptyState title={t('market.skills.mine.empty')} />
            ) : (
              <MarketUploadList label={t('market.mine.skills')}>
                {skills.skills.map((skill) => (
                  <MarketUploadItem
                    key={skill.id}
                    data={{ 'data-market-mine-skill': skill.id }}
                    image={<SkillLogo />}
                    name={skill.name}
                    meta={
                      <>
                        {skill.scan === 'warning' ? (
                          <Tag tone="warning">{t('market.skills.warning')}</Tag>
                        ) : null}
                        {skill.scripts.length > 0 ? (
                          <Tag tone="neutral">{t('market.skills.hasScripts')}</Tag>
                        ) : null}
                        <span>
                          {skillFilesLabel(skill.fileCount, t)} · {installsLabel(skill.installs, t)}
                        </span>
                      </>
                    }
                    changeLabel={t('market.skills.mine.replace')}
                    changeAriaLabel={t('market.skills.mine.replaceLabel', { name: skill.name })}
                    onChange={() => go({ kind: 'skill-replace', skill })}
                    onDelete={() => go({ kind: 'skill-delete', skill })}
                    t={t}
                  />
                ))}
              </MarketUploadList>
            )}
          </>
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

export function MarketUploadList({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div {...stylex.props(styles.list)} role="list" aria-label={label}>
      {children}
    </div>
  );
}

export function MarketUploadItem({
  data,
  image,
  name,
  meta,
  changeLabel,
  changeAriaLabel,
  onChange,
  onDelete,
  t,
}: {
  data: Record<`data-${string}`, string>;
  image: ReactNode;
  name: string;
  meta: ReactNode;
  changeLabel: string;
  changeAriaLabel: string;
  onChange: () => void;
  onDelete: () => void;
  t: BotHarnessTranslate;
}) {
  return (
    <div {...stylex.props(styles.row)} {...data} role="listitem">
      {image}
      <span {...stylex.props(styles.copy)}>
        <span {...stylex.props(styles.name)}>{name}</span>
        <span {...stylex.props(styles.meta)}>{meta}</span>
      </span>
      <span {...stylex.props(styles.actions)}>
        <Button size="sm" variant="outline" aria-label={changeAriaLabel} onClick={onChange}>
          {changeLabel}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          aria-label={t('market.mine.deleteLabel', { name })}
          onClick={onDelete}
        >
          {t('market.mine.delete')}
        </Button>
      </span>
    </div>
  );
}

export function UploadDeleteDialog({
  name,
  body,
  busy,
  cause,
  t,
  onCancel,
  onDelete,
}: {
  name: string;
  body: string;
  busy: boolean;
  cause: unknown;
  t: BotHarnessTranslate;
  onCancel: () => void;
  onDelete: () => void;
}) {
  return (
    <FormDialog
      title={t('market.mine.deleteTitle', { name })}
      size="small"
      labels={{ close: t('common.close'), cancel: t('common.cancel') }}
      submitLabel={t('market.mine.deleteConfirm')}
      busy={busy}
      danger
      error={
        cause === undefined ? undefined : <Note tone="danger">{marketplaceError(cause, t)}</Note>
      }
      onCancel={onCancel}
      onSubmit={onDelete}
    >
      <Note>{body}</Note>
    </FormDialog>
  );
}
