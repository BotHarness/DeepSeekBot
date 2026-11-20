import { useId, useRef, useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';

import {
  parseMarketplaceAvatarText,
  type MarketplaceAvatar,
  type MarketplaceAvatarPage,
} from '@botharness/host-protocol/marketplace-avatar';
import type { BridgeActions } from './actions.js';
import { Button } from './ds/button.js';
import { Checkbox } from './ds/checkbox.js';
import { FieldStack, TextAreaField, TextField } from './ds/field.js';
import { FormDialog } from './ds/form-dialog.js';
import { HiddenFileInput } from './ds/input.js';
import { Note } from './ds/note.js';
import { radius, space } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import { MarketPage } from './market-page.js';
import { marketplaceError } from './marketplace-feedback.js';
import { useMountedResource } from './mounted-resource.js';
import { PersonaBotAvatarCropModal } from './personabot-avatar-crop.js';
import { useTeamMode } from './team-state.js';

const styles = stylex.create({
  grid: {
    display: 'grid',
    width: '100%',
    gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 8rem), 1fr))',
    gap: space.x3,
  },
  tile: {
    width: '100%',
    height: 'auto',
    flexDirection: 'column',
    padding: space.x2,
    whiteSpace: 'normal',
    overflowWrap: 'anywhere',
  },
  thumbnail: {
    display: 'block',
    width: '100%',
    aspectRatio: '1',
    borderRadius: radius.sm,
    objectFit: 'cover',
  },
  preview: {
    width: 'min(100%, 16rem)',
    height: 'auto',
    aspectRatio: '1',
    borderRadius: radius.sm,
    objectFit: 'cover',
  },
  copy: { overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' },
  body: { display: 'grid', justifyItems: 'start', gap: space.x4 },
  hidden: { display: 'none' },
});

type Actions = Pick<
  BridgeActions,
  | 'teamCall'
  | 'marketplaceAvatarList'
  | 'marketplaceAvatarDetail'
  | 'marketplaceAvatarPublish'
  | 'marketplaceAccount'
  | 'marketplaceAuthorSave'
>;

type MarketplaceAccount = Awaited<ReturnType<BridgeActions['marketplaceAccount']>>;

type Read<T> =
  | { kind: 'loading' }
  | { kind: 'failed'; error: unknown }
  | { kind: 'ready'; value: T };

export function MarketAvatars({
  actions,
  t,
  active,
}: {
  actions: Actions;
  t: BotHarnessTranslate;
  active: boolean;
}): ReactElement {
  const owner = useTeamMode(actions.teamCall)?.viewer.kind === 'owner';
  const [listing, setListing] = useState<Read<MarketplaceAvatarPage>>({ kind: 'loading' });
  const [nextError, setNextError] = useState<unknown>();
  const [loadingMore, setLoadingMore] = useState(false);
  const fetchingNext = useRef(false);
  const [reload, setReload] = useState(0);
  const [publishing, setPublishing] = useState(false);
  const [selected, setSelected] = useState<MarketplaceAvatar>();
  const mount = useMountedResource<HTMLDivElement>(() => {
    let subscribed = true;
    void actions.marketplaceAvatarList().then(
      (value) => {
        if (subscribed) setListing({ kind: 'ready', value });
      },
      (error: unknown) => {
        if (subscribed) setListing({ kind: 'failed', error });
      },
    );
    return () => {
      subscribed = false;
    };
  }, [actions, reload]);

  const more = async () => {
    if (listing.kind !== 'ready' || listing.value.nextCursor === null || fetchingNext.current)
      return;
    fetchingNext.current = true;
    setLoadingMore(true);
    setNextError(undefined);
    try {
      const next = await actions.marketplaceAvatarList(listing.value.nextCursor);
      setListing((current) => {
        if (current.kind !== 'ready') return current;
        const ids = new Set(current.value.avatars.map(({ id }) => id));
        return {
          kind: 'ready',
          value: {
            avatars: [...current.value.avatars, ...next.avatars.filter(({ id }) => !ids.has(id))],
            nextCursor: next.nextCursor,
          },
        };
      });
    } catch (error) {
      setNextError(error);
    } finally {
      fetchingNext.current = false;
      setLoadingMore(false);
    }
  };

  return (
    <>
      <div
        ref={mount}
        {...stylex.props(styles.body, selected !== undefined && styles.hidden)}
        hidden={selected !== undefined}
      >
        {owner && (
          <Button variant="primary" onClick={() => setPublishing(true)}>
            {t('market.avatar.publish')}
          </Button>
        )}
        {listing.kind === 'loading' && <p role="status">{t('market.loading')}</p>}
        {listing.kind === 'failed' && (
          <>
            <Note tone="danger">{marketplaceError(listing.error, t)}</Note>
            <Button
              onClick={() => {
                setListing({ kind: 'loading' });
                setReload(reload + 1);
              }}
            >
              {t('market.retry')}
            </Button>
          </>
        )}
        {listing.kind === 'ready' &&
          (listing.value.avatars.length === 0 ? (
            <p>{t('market.avatar.empty')}</p>
          ) : (
            <div {...stylex.props(styles.grid)} role="list" aria-label={t('market.avatar.title')}>
              {listing.value.avatars.map((avatar) => (
                <div role="listitem" key={avatar.id}>
                  <Button
                    variant="outline"
                    xstyle={styles.tile}
                    onClick={() => setSelected(avatar)}
                  >
                    <img
                      {...stylex.props(styles.thumbnail)}
                      src={avatar.imageUrl}
                      alt=""
                      loading="lazy"
                      width={128}
                      height={128}
                    />
                    {avatar.name}
                  </Button>
                </div>
              ))}
            </div>
          ))}
        {nextError !== undefined && <Note tone="danger">{marketplaceError(nextError, t)}</Note>}
        {listing.kind === 'ready' && listing.value.nextCursor !== null && (
          <Button disabled={loadingMore} onClick={() => void more()}>
            {t('market.loadMore')}
          </Button>
        )}
      </div>
      {selected !== undefined && (
        <MarketAvatarDetail
          key={selected.id}
          initial={selected}
          actions={actions}
          t={t}
          onBack={() => setSelected(undefined)}
        />
      )}
      {active && owner && publishing && (
        <MarketAvatarPublishDialog
          actions={actions}
          t={t}
          onClose={() => setPublishing(false)}
          onPublished={(avatar) => {
            setPublishing(false);
            setListing((current) =>
              current.kind === 'ready'
                ? {
                    kind: 'ready',
                    value: {
                      ...current.value,
                      avatars: [
                        avatar,
                        ...current.value.avatars.filter((item) => item.id !== avatar.id),
                      ],
                    },
                  }
                : current,
            );
            setSelected(avatar);
          }}
        />
      )}
    </>
  );
}

function MarketAvatarDetail({
  initial,
  actions,
  t,
  onBack,
}: {
  initial: MarketplaceAvatar;
  actions: Actions;
  t: BotHarnessTranslate;
  onBack: () => void;
}): ReactElement {
  const [detail, setDetail] = useState<Read<MarketplaceAvatar>>({ kind: 'loading' });
  const mount = useMountedResource<HTMLDivElement>(() => {
    let subscribed = true;
    void actions.marketplaceAvatarDetail(initial.id).then(
      (value) => {
        if (subscribed) setDetail({ kind: 'ready', value });
      },
      (error: unknown) => {
        if (subscribed) setDetail({ kind: 'failed', error });
      },
    );
    return () => {
      subscribed = false;
    };
  }, [actions, initial.id]);
  const avatar = detail.kind === 'ready' ? detail.value : initial;
  return (
    <MarketPage page="avatar-detail" title={avatar.name} hidden={false} t={t} onBack={onBack}>
      <div ref={mount} {...stylex.props(styles.body)}>
        {detail.kind === 'failed' ? (
          <Note tone="danger">{marketplaceError(detail.error, t)}</Note>
        ) : (
          <>
            <img
              {...stylex.props(styles.preview)}
              alt={avatar.name}
              src={avatar.imageUrl}
              width={256}
              height={256}
            />
            {avatar.description && <p {...stylex.props(styles.copy)}>{avatar.description}</p>}
            {avatar.tags.length > 0 && (
              <p {...stylex.props(styles.copy)} aria-label={t('market.direct.tags')}>
                {avatar.tags.join(' · ')}
              </p>
            )}
            <p {...stylex.props(styles.copy)}>
              {t('market.avatar.author', { name: avatar.author.name, id: avatar.author.id })}
            </p>
            <p>{t('market.avatar.applyCount', { count: avatar.applyCount })}</p>
          </>
        )}
      </div>
    </MarketPage>
  );
}

export function MarketAvatarPublishDialog({
  actions,
  t,
  onClose,
  onPublished,
}: {
  actions: Pick<
    Actions,
    'marketplaceAccount' | 'marketplaceAuthorSave' | 'marketplaceAvatarPublish'
  >;
  t: BotHarnessTranslate;
  onClose: () => void;
  onPublished: (avatar: MarketplaceAvatar) => void;
}): ReactElement {
  const uploadId = useId();
  const [file, setFile] = useState<File>();
  const [image, setImage] = useState<string>();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [account, setAccount] = useState<Read<MarketplaceAccount>>({ kind: 'loading' });
  const [authorName, setAuthorName] = useState<string>();
  const [terms, setTerms] = useState(false);
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const lock = useRef(false);
  const requestKey = useRef<string>();
  const input = useRef<HTMLInputElement>(null);
  const mount = useMountedResource<HTMLDivElement>(() => {
    let subscribed = true;
    void actions.marketplaceAccount().then(
      (value) => {
        if (subscribed) setAccount({ kind: 'ready', value });
      },
      (cause: unknown) => {
        if (subscribed) setAccount({ kind: 'failed', error: cause });
      },
    );
    return () => {
      subscribed = false;
    };
  }, [actions, reload]);
  const author = account.kind === 'ready' ? account.value.author : null;
  const prepared = author?.termsAcceptedAt != null;
  const draftName = authorName ?? author?.name ?? '';
  const text = parseMarketplaceAvatarText({
    name,
    description,
    tags: tags.trim() ? tags.split(/[,，]/u) : [],
  });

  const run = async (submit: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setError(undefined);
    setBusy(true);
    try {
      await submit();
    } catch (cause) {
      setError(cause);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const submit = () => {
    if (account.kind !== 'ready') return;
    if (!prepared) {
      void run(async () => {
        const saved = await actions.marketplaceAuthorSave(draftName.trim(), true);
        setAccount({ kind: 'ready', value: { ...account.value, author: saved } });
      });
    } else if (image !== undefined && text !== undefined && author !== null) {
      const key = (requestKey.current ??= crypto.randomUUID());
      void run(async () =>
        onPublished(
          await actions.marketplaceAvatarPublish({
            ...text,
            image,
            requestKey: key,
            confirm: true,
            expectedAuthorId: author.id,
          }),
        ),
      );
    }
  };
  const close = () => {
    if (!lock.current) onClose();
  };
  const signedIn = account.kind === 'ready' && account.value.signedIn;
  return (
    <>
      <FormDialog
        title={t('market.avatar.publish')}
        labels={{ close: t('common.close'), cancel: t('common.cancel') }}
        submitLabel={t(prepared ? 'market.avatar.publish' : 'market.author.continue')}
        onCancel={close}
        onSubmit={signedIn ? submit : undefined}
        submitDisabled={
          prepared ? image === undefined || text === undefined : !terms || !draftName.trim()
        }
        busy={busy}
        scroll
        error={error === undefined ? undefined : marketplaceError(error, t)}
      >
        <div ref={mount}>
          {account.kind === 'loading' && <p role="status">{t('market.loading')}</p>}
          {account.kind === 'failed' && (
            <Note tone="danger">{marketplaceError(account.error, t)}</Note>
          )}
          {account.kind === 'ready' && !signedIn && <p>{t('market.avatar.signIn')}</p>}
          {(account.kind === 'failed' || (account.kind === 'ready' && !signedIn)) && (
            <Button
              type="button"
              onClick={() => {
                setAccount({ kind: 'loading' });
                setReload(reload + 1);
              }}
            >
              {t('market.retry')}
            </Button>
          )}
          {signedIn && !prepared && (
            <FieldStack>
              <TextField
                label={t('market.author.name')}
                value={draftName}
                maxLength={40}
                onChange={setAuthorName}
              />
              <Checkbox checked={terms} onChange={setTerms} label={t('market.author.terms')} />
            </FieldStack>
          )}
          {signedIn && prepared && author !== null && (
            <FieldStack>
              <p {...stylex.props(styles.copy)}>
                {t('market.avatar.author', { name: author.name, id: author.id })}
              </p>
              <HiddenFileInput
                ref={input}
                aria-label={t('market.avatar.chooseFile')}
                accept="image/png,image/jpeg,image/webp"
                disabled={busy}
                onChange={(event) => {
                  const chosen = event.currentTarget.files?.[0];
                  event.currentTarget.value = '';
                  if (chosen !== undefined) setFile(chosen);
                }}
              />
              <Button
                aria-describedby={image === undefined ? undefined : uploadId}
                type="button"
                disabled={busy}
                onClick={() => input.current?.click()}
              >
                {t('market.avatar.chooseFile')}
              </Button>
              {image !== undefined && (
                <img
                  id={uploadId}
                  {...stylex.props(styles.preview)}
                  src={image}
                  alt={t('market.avatar.preview')}
                  width={256}
                  height={256}
                />
              )}
              <TextField
                label={t('market.direct.name')}
                value={name}
                disabled={busy}
                onChange={setName}
                hint={t('market.avatar.nameHint')}
              />
              <TextAreaField
                label={t('market.direct.bio')}
                value={description}
                disabled={busy}
                onChange={setDescription}
                hint={t('market.avatar.bioHint')}
                rows={2}
              />
              <TextField
                label={t('market.direct.tags')}
                value={tags}
                disabled={busy}
                onChange={setTags}
                hint={t('market.avatar.tagsHint')}
              />
              <p>{t('market.avatar.publicNotice')}</p>
            </FieldStack>
          )}
        </div>
      </FormDialog>
      {file !== undefined && (
        <PersonaBotAvatarCropModal
          marketplace
          file={file}
          t={t}
          onClose={() => setFile(undefined)}
          onSave={async (crop) => {
            setImage(crop);
            return true;
          }}
        />
      )}
    </>
  );
}
