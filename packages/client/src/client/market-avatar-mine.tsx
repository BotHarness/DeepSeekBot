import { useRef, useState, type ReactElement } from 'react';
import {
  parseMarketplaceAvatarEdit,
  type MarketplaceAvatar,
  type MarketplaceAvatarEdit,
} from '@botharness/host-protocol/marketplace-avatar';
import type { BridgeActions } from './actions.js';
import { PersonaBotAvatar } from './avatar.js';
import { EmptyState } from './ds/empty-state.js';
import { FieldStack, TextAreaField, TextField } from './ds/field.js';
import { FormDialog } from './ds/form-dialog.js';
import { Note } from './ds/note.js';
import { PanelDialog } from './ds/panel-dialog.js';
import type { BotHarnessTranslate } from './locale.js';
import { MarketUploadList, MarketUploadItem, UploadDeleteDialog } from './market-mine.js';
import { marketplaceError } from './marketplace-feedback.js';
import { useMountedResource } from './mounted-resource.js';

export type AvatarMineActions = Pick<
  BridgeActions,
  'marketplaceAvatarMine' | 'marketplaceAvatarEdit' | 'marketplaceAvatarDelete'
>;

type Listing =
  | { kind: 'loading' }
  | { kind: 'error'; cause: unknown }
  | { kind: 'ready'; avatars: MarketplaceAvatar[] };

type Screen = { kind: 'edit' | 'delete'; avatar: MarketplaceAvatar };

export function MyAvatarsDialog({
  actions,
  t,
  onUpdated,
  onDeleted,
  onClose,
}: {
  actions: AvatarMineActions;
  t: BotHarnessTranslate;
  onUpdated: (avatar: MarketplaceAvatar) => void;
  onDeleted: (id: string) => void;
  onClose: () => void;
}): ReactElement {
  const [list, setList] = useState<Listing>({ kind: 'loading' });
  const [screen, setScreen] = useState<Screen>();
  const [busy, setBusy] = useState(false);
  const [cause, setCause] = useState<unknown>();
  const mounted = useRef(false);
  const lock = useRef(false);
  const mount = useMountedResource<HTMLSpanElement>(() => {
    mounted.current = true;
    void actions.marketplaceAvatarMine().then(
      ({ avatars }) => {
        if (mounted.current) setList({ kind: 'ready', avatars });
      },
      (cause: unknown) => {
        if (mounted.current) setList({ kind: 'error', cause });
      },
    );
    return () => {
      mounted.current = false;
    };
  }, []);
  const go = (next?: Screen) => {
    if (lock.current) return;
    setCause(undefined);
    setScreen(next);
  };
  const commit = async (operation: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setCause(undefined);
    try {
      await operation();
      if (mounted.current) setScreen(undefined);
    } catch (error) {
      if (mounted.current) setCause(error);
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const view = () => {
    if (screen?.kind === 'edit') {
      const { avatar } = screen;
      return (
        <EditAvatarDialog
          avatar={avatar}
          busy={busy}
          cause={cause}
          t={t}
          onCancel={() => go()}
          onSave={(patch) =>
            void commit(async () => {
              const saved = await actions.marketplaceAvatarEdit(avatar.id, patch);
              onUpdated(saved);
              if (mounted.current)
                setList((current) =>
                  current.kind === 'ready'
                    ? {
                        kind: 'ready',
                        avatars: current.avatars.map((item) =>
                          item.id === saved.id ? saved : item,
                        ),
                      }
                    : current,
                );
            })
          }
        />
      );
    }
    if (screen?.kind === 'delete') {
      const { avatar } = screen;
      return (
        <UploadDeleteDialog
          name={avatar.name}
          body={t('market.avatar.mine.deleteBody')}
          busy={busy}
          cause={cause}
          t={t}
          onCancel={() => go()}
          onDelete={() =>
            void commit(async () => {
              await actions.marketplaceAvatarDelete(avatar.id);
              onDeleted(avatar.id);
              if (mounted.current)
                setList((current) =>
                  current.kind === 'ready'
                    ? {
                        kind: 'ready',
                        avatars: current.avatars.filter(({ id }) => id !== avatar.id),
                      }
                    : current,
                );
            })
          }
        />
      );
    }
    const title = t('market.avatar.mine.title');
    return (
      <PanelDialog
        size="small"
        title={title}
        closeLabel={t('common.close')}
        onClose={onClose}
        scroll
      >
        {list.kind === 'loading' ? (
          <Note>{t('market.loading')}</Note>
        ) : list.kind === 'error' ? (
          <Note tone="danger">{marketplaceError(list.cause, t)}</Note>
        ) : list.avatars.length === 0 ? (
          <EmptyState title={t('market.avatar.mine.empty')} />
        ) : (
          <MarketUploadList label={title}>
            {list.avatars.map((avatar) => (
              <MarketUploadItem
                key={avatar.id}
                data={{ 'data-market-mine-avatar': avatar.id }}
                image={
                  <PersonaBotAvatar
                    personaBotId={avatar.id}
                    name={avatar.name}
                    src={avatar.imageUrl}
                    size={40}
                    still
                    preview
                    indicator={false}
                    nativeTitle={false}
                    t={t}
                  />
                }
                name={avatar.name}
                meta={t('market.applyCount', { count: String(avatar.applyCount) })}
                changeLabel={t('market.avatar.mine.edit')}
                changeAriaLabel={t('market.avatar.mine.editLabel', { name: avatar.name })}
                onChange={() => go({ kind: 'edit', avatar })}
                onDelete={() => go({ kind: 'delete', avatar })}
                t={t}
              />
            ))}
          </MarketUploadList>
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

function EditAvatarDialog({
  avatar,
  busy,
  cause,
  t,
  onCancel,
  onSave,
}: {
  avatar: MarketplaceAvatar;
  busy: boolean;
  cause: unknown;
  t: BotHarnessTranslate;
  onCancel: () => void;
  onSave: (patch: MarketplaceAvatarEdit) => void;
}) {
  const [name, setName] = useState<string>();
  const [description, setDescription] = useState<string>();
  const [tags, setTags] = useState<string>();
  const patch = parseMarketplaceAvatarEdit({
    name,
    description,
    tags: tags === undefined ? undefined : tags.trim() ? tags.split(/[,，]/u) : [],
  });
  return (
    <FormDialog
      title={t('market.avatar.mine.editLabel', { name: avatar.name })}
      labels={{ close: t('common.close'), cancel: t('common.cancel') }}
      submitLabel={t('market.avatar.mine.save')}
      submitDisabled={patch === undefined}
      busy={busy}
      error={
        cause === undefined ? undefined : <Note tone="danger">{marketplaceError(cause, t)}</Note>
      }
      onCancel={onCancel}
      onSubmit={() => {
        if (patch !== undefined) onSave(patch);
      }}
    >
      <FieldStack>
        <TextField
          label={t('market.direct.name')}
          value={name ?? avatar.name}
          onChange={setName}
          disabled={busy}
          hint={t('market.avatar.nameHint')}
          initialFocus
        />
        <TextAreaField
          label={t('market.direct.bio')}
          value={description ?? avatar.description}
          onChange={setDescription}
          disabled={busy}
          hint={t('market.avatar.bioHint')}
          rows={2}
        />
        <TextField
          label={t('market.direct.tags')}
          value={tags ?? avatar.tags.join(', ')}
          onChange={setTags}
          disabled={busy}
          hint={t('market.avatar.tagsHint')}
        />
      </FieldStack>
    </FormDialog>
  );
}
