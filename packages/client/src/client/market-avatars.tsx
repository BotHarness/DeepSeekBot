import { useCallback, useId, useRef, useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';

import {
  MAX_MARKETPLACE_AVATAR_QUERY,
  parseMarketplaceAvatarText,
  type MarketplaceAvatar,
  type MarketplaceAvatarPage,
  type MarketplaceAvatarQuery,
  type MarketplaceAvatarTag,
} from '@botharness/host-protocol/marketplace-avatar';
import type { BridgeActions } from './actions.js';
import { PersonaBotAvatar } from './avatar.js';
import { formatStars } from './community-links.js';
import { startConnectSignIn, type ConnectSignInCode } from './connect-sign-in.js';
import { ConnectSignInBlock } from './connect-sign-in-block.js';
import { Button } from './ds/button.js';
import { Checkbox } from './ds/checkbox.js';
import { joinClass } from './ds/class-name.js';
import { FieldStack, TextAreaField, TextField } from './ds/field.js';
import { HiddenFileInput } from './ds/input.js';
import { Note } from './ds/note.js';
import { PanelDialog } from './ds/panel-dialog.js';
import { ReadFailure } from './ds/read-failure.js';
import { StepProgress } from './ds/step-progress.js';
import { Tag } from './ds/tag.js';
import { layer, space, style } from './ds/tobs.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import { MarketAvatarApplyDialog, type AvatarApplyActions } from './market-avatar-apply.js';
import { MyAvatarsDialog, type AvatarMineActions } from './market-avatar-mine.js';
import { MarketPage } from './market-page.js';
import { MarketplaceSearchField } from './marketplace-browse-controls.js';
import { MarketplaceTopicChips } from './marketplace.js';
import { marketplaceError } from './marketplace-feedback.js';
import { MarketplaceLoadMoreButton } from './marketplace-list-status.js';
import { marketplaceLanguage } from './marketplace-listing.js';
import {
  ReportActions,
  ReportButton,
  ReportPanel,
  useMarketplaceReport,
} from './marketplace-report.js';
import { proveHuman } from './marketplace.js';
import { observeResource } from './messaging-defaults-live.js';
import { useMountedResource } from './mounted-resource.js';
import { PersonaBotAvatarCropModal } from './personabot-avatar-crop.js';

const styles = stylex.create({
  grid: {
    gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 8rem), 1fr))',
  },
  gridAfterTags: { marginBlockStart: `calc(${space.x4} - ${space.x3})` },
  cardOpen: {
    alignItems: 'stretch',
    justifyContent: 'flex-start',
    aspectRatio: 'auto',
    backgroundColor: 'transparent',
    gap: 0,
    whiteSpace: 'normal',
  },
  thumbnail: {
    display: 'block',
    width: '100%',
    height: 'auto',
    aspectRatio: '1',
    objectFit: 'cover',
    backgroundColor: layer.well,
  },
  title: { flexDirection: 'column', alignItems: 'flex-start', overflowWrap: 'anywhere' },
  artwork: { width: 'min(100%, 16rem)', borderRadius: style.radiusCard },
  photoField: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: space.x3 },
  description: { whiteSpace: 'pre-wrap' },
});

type BrowseActions = AvatarApplyActions &
  Pick<
    BridgeActions,
    | 'marketplaceAvatarList'
    | 'marketplaceAvatarTags'
    | 'marketplaceAvatarDetail'
    | 'marketplaceAvatarReport'
    | 'marketplaceChallenge'
  >;
type PublishActions = Pick<
  BridgeActions,
  | 'marketplaceAccount'
  | 'marketplaceAuthorSave'
  | 'marketplaceAvatarPublish'
  | 'marketplaceAvatarSource'
>;
type MarketplaceAccount = Awaited<ReturnType<BridgeActions['marketplaceAccount']>>;

type Read<T> =
  | { kind: 'loading' }
  | { kind: 'failed'; error: unknown }
  | { kind: 'ready'; value: T };

function AvatarOwner({
  avatar,
  t,
}: {
  avatar: MarketplaceAvatar;
  t: BotHarnessTranslate;
}): ReactElement {
  const { name, id } = avatar.author;
  return (
    <span className="bh-market-owner" title={t('market.avatar.author', { name, id })}>
      {name} #{id}
    </span>
  );
}

function AvatarApplyCount({ count, t }: { count: number; t: BotHarnessTranslate }): ReactElement {
  const label = t('market.applyCount', { count: String(count) });
  return (
    <span className="bh-market-installs" title={label} aria-label={label}>
      {t('market.applyCount', { count: formatStars(count, marketplaceLanguage(t)) })}
    </span>
  );
}

function MarketAvatarCard({
  avatar,
  t,
  onOpen,
}: {
  avatar: MarketplaceAvatar;
  t: BotHarnessTranslate;
  onOpen: () => void;
}): ReactElement {
  return (
    <div className="bh-market-tile" role="listitem">
      <Button
        variant="preview"
        className="bh-market-open bh-market-tile-open"
        xstyle={styles.cardOpen}
        aria-label={t('market.detail.open', { name: avatar.name })}
        onClick={onOpen}
      >
        <img
          {...stylex.props(styles.thumbnail)}
          src={avatar.imageUrl}
          alt=""
          loading="lazy"
          width={128}
          height={128}
        />
        <span className="bh-market-tile-head">
          <span className="bh-market-copy">
            <span className="bh-market-card-name">{avatar.name}</span>
            <AvatarOwner avatar={avatar} t={t} />
          </span>
        </span>
        <span className="bh-market-tile-foot">
          <span className="bh-market-meta">
            <AvatarApplyCount count={avatar.applyCount} t={t} />
          </span>
        </span>
      </Button>
    </div>
  );
}

export function MarketAvatars({
  actions,
  t,
  publishing,
  avatarSource,
  managing = false,
  onClosePublish,
}: {
  actions: BrowseActions & PublishActions & AvatarMineActions;
  t: BotHarnessTranslate;
  publishing: boolean;
  avatarSource?: { slug: string; actions: BrowseActions & PublishActions } | undefined;
  managing?: boolean;
  onClosePublish: () => void;
}): ReactElement {
  const [listing, setListing] = useState<Read<MarketplaceAvatarPage>>({ kind: 'loading' });
  const [nextError, setNextError] = useState<unknown>();
  const [loadingMore, setLoadingMore] = useState(false);
  const fetchingNext = useRef(false);
  const generation = useRef(0);
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState<{ avatar: MarketplaceAvatar; actions: BrowseActions }>();
  const publishActions = avatarSource?.actions ?? actions;
  const [searchText, setSearchText] = useState('');
  const [filters, setFilters] = useState<Omit<MarketplaceAvatarQuery, 'cursor'>>({});
  const [tags, setTags] = useState<MarketplaceAvatarTag[]>([]);
  const updateListedCount = useCallback((avatar: MarketplaceAvatar) => {
    setListing((current) =>
      current.kind === 'ready'
        ? {
            kind: 'ready',
            value: {
              ...current.value,
              avatars: current.value.avatars.map((item) => (item.id === avatar.id ? avatar : item)),
            },
          }
        : current,
    );
  }, []);
  const tagMount = useMountedResource<HTMLDivElement>(() => {
    let subscribed = true;
    void actions.marketplaceAvatarTags().then(
      (value) => {
        if (subscribed) setTags(value);
      },
      () => {
        if (subscribed) setTags([]);
      },
    );
    return () => {
      subscribed = false;
    };
  }, [actions, reload]);

  const mount = useMountedResource<HTMLDivElement>(() => {
    const ticket = ++generation.current;
    fetchingNext.current = false;
    setLoadingMore(false);
    setNextError(undefined);
    setListing({ kind: 'loading' });
    void actions.marketplaceAvatarList(filters).then(
      (value) => {
        if (ticket === generation.current) setListing({ kind: 'ready', value });
      },
      (error: unknown) => {
        if (ticket === generation.current) setListing({ kind: 'failed', error });
      },
    );
    return () => {
      generation.current += 1;
    };
  }, [actions, filters, reload]);

  const more = async () => {
    if (listing.kind !== 'ready' || listing.value.nextCursor === null || fetchingNext.current)
      return;
    fetchingNext.current = true;
    const ticket = generation.current;
    setLoadingMore(true);
    setNextError(undefined);
    try {
      const next = await actions.marketplaceAvatarList({
        ...filters,
        cursor: listing.value.nextCursor,
      });
      if (ticket !== generation.current) return;
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
      if (ticket === generation.current) setNextError(error);
    } finally {
      if (ticket === generation.current) {
        fetchingNext.current = false;
        setLoadingMore(false);
      }
    }
  };

  return (
    <>
      <div className="bh-market-page" hidden={selected !== undefined} ref={tagMount}>
        <div className="bh-market-panel" ref={mount}>
          <div className="bh-market-browse">
            <MarketplaceSearchField
              label={t('market.avatar.search.label')}
              placeholder={t('market.avatar.search.placeholder')}
              maxLength={MAX_MARKETPLACE_AVATAR_QUERY}
              value={searchText}
              onChange={setSearchText}
              onSearch={() => {
                const q = searchText.trim();
                setFilters(({ tag }) => ({
                  ...(q ? { q } : {}),
                  ...(tag === undefined ? {} : { tag }),
                }));
              }}
            />
          </div>
          <MarketplaceTopicChips
            topics={tags.map(({ tag, count }) => ({ topic: tag, count }))}
            selected={filters.tag}
            onChoose={(tag) =>
              setFilters(({ q }) => ({
                ...(q === undefined ? {} : { q }),
                ...(tag === undefined ? {} : { tag }),
              }))
            }
            label={t('market.avatar.tags.label')}
            t={t}
          />
          {listing.kind === 'loading' && (
            <div className="bh-market-state" role="status">
              {t('market.loading')}
            </div>
          )}
          {listing.kind === 'failed' && (
            <ReadFailure
              retryLabel={t('market.retry')}
              onRetry={() => {
                setListing({ kind: 'loading' });
                setReload((value) => value + 1);
              }}
            >
              {t('market.error.load', { error: marketplaceError(listing.error, t) })}
            </ReadFailure>
          )}
          {listing.kind === 'ready' &&
            (listing.value.avatars.length === 0 ? (
              <div className="bh-market-state">
                {t(filters.q || filters.tag ? 'market.avatar.search.empty' : 'market.avatar.empty')}
              </div>
            ) : (
              <div
                className={joinClass(
                  'bh-market-grid',
                  stylex.props(styles.grid, tags.length > 0 && styles.gridAfterTags).className,
                )}
                role="list"
                aria-label={t('market.avatar.title')}
              >
                {listing.value.avatars.map((avatar) => (
                  <MarketAvatarCard
                    key={avatar.id}
                    avatar={avatar}
                    t={t}
                    onOpen={() => setSelected({ avatar, actions })}
                  />
                ))}
              </div>
            ))}
          {nextError !== undefined ? (
            <ReadFailure retryLabel={t('market.retry')} onRetry={() => void more()}>
              {t('market.error.load', { error: marketplaceError(nextError, t) })}
            </ReadFailure>
          ) : (
            listing.kind === 'ready' &&
            listing.value.nextCursor !== null && (
              <MarketplaceLoadMoreButton
                loading={loadingMore}
                onLoadMore={() => void more()}
                t={t}
              />
            )
          )}
        </div>
      </div>
      {selected !== undefined && (
        <MarketAvatarDetail
          key={`${selected.avatar.id}:${reload}`}
          initial={selected.avatar}
          onRead={updateListedCount}
          actions={selected.actions}
          t={t}
          onBack={() => setSelected(undefined)}
        />
      )}
      {managing && (
        <MyAvatarsDialog
          actions={actions}
          t={t}
          onClose={onClosePublish}
          onUpdated={(avatar) => {
            setSelected((current) =>
              current?.actions === actions && current.avatar.id === avatar.id
                ? { ...current, avatar }
                : current,
            );
            setReload((value) => value + 1);
          }}
          onDeleted={(id) => {
            setSelected((current) =>
              current?.actions === actions && current.avatar.id === id ? undefined : current,
            );
            setReload((value) => value + 1);
          }}
        />
      )}
      {publishing && (
        <MarketAvatarPublishDialog
          key={avatarSource?.slug}
          actions={publishActions}
          avatarSource={avatarSource?.slug}
          t={t}
          onClose={onClosePublish}
          onPublished={(avatar) => {
            onClosePublish();
            if (publishActions === actions) setReload((value) => value + 1);
            setSelected({ avatar, actions: publishActions });
          }}
        />
      )}
    </>
  );
}

function MarketAvatarDetail({
  initial,
  actions,
  onRead,
  t,
  onBack,
}: {
  initial: MarketplaceAvatar;
  actions: BrowseActions;
  onRead: (avatar: MarketplaceAvatar) => void;
  t: BotHarnessTranslate;
  onBack: () => void;
}): ReactElement {
  const report = useMarketplaceReport(() => proveHuman(actions), actions.marketplaceAvatarReport);
  const [picking, setPicking] = useState(false);
  const [appliedName, setAppliedName] = useState<string>();
  const [detail, setDetail] = useState<Read<MarketplaceAvatar>>({ kind: 'loading' });
  const [reload, setReload] = useState(0);
  const mount = useMountedResource<HTMLDivElement>(() => {
    let subscribed = true;
    void actions.marketplaceAvatarDetail(initial.id).then(
      (value) => {
        if (subscribed) {
          setDetail({ kind: 'ready', value });
          onRead(value);
        }
      },
      (error: unknown) => {
        if (subscribed) setDetail({ kind: 'failed', error });
      },
    );
    return () => {
      subscribed = false;
    };
  }, [actions, initial.id, onRead, reload]);
  const avatar = detail.kind === 'ready' ? detail.value : initial;
  return (
    <MarketPage
      page="avatar-detail"
      title={avatar.name}
      hidden={false}
      t={t}
      onBack={() => {
        report.close();
        onBack();
      }}
      secondary={
        report.state.status === 'closed' ? (
          <>
            {appliedName === undefined ? null : (
              <Note tone="success">{t('market.avatar.applied', { name: appliedName })}</Note>
            )}
            <ReportButton report={report} t={t} disabled={detail.kind !== 'ready'} />
          </>
        ) : undefined
      }
      actions={
        report.state.status === 'open' ? (
          <ReportActions report={report} id={avatar.id} t={t} />
        ) : (
          <Button
            variant="primary"
            disabled={detail.kind !== 'ready'}
            onClick={() => setPicking(true)}
          >
            {t('market.avatar.apply')}
          </Button>
        )
      }
    >
      {picking && (
        <MarketAvatarApplyDialog
          id={avatar.id}
          actions={actions}
          t={t}
          onClose={() => setPicking(false)}
          onApplied={(bot) => {
            setPicking(false);
            setAppliedName(bot.displayName);
            setReload((value) => value + 1);
          }}
        />
      )}
      <div ref={mount} className="bh-market-detail">
        <div className="bh-market-hero">
          <img
            {...stylex.props(styles.thumbnail, styles.artwork)}
            alt={avatar.name}
            src={avatar.imageUrl}
            width={256}
            height={256}
          />
          <div className="bh-market-hero-name">
            <div className={joinClass('bh-market-name', stylex.props(styles.title).className)}>
              <span>{avatar.name}</span>
              <AvatarOwner avatar={avatar} t={t} />
            </div>
          </div>
          {avatar.description && (
            <span
              className={joinClass(
                'bh-market-description',
                stylex.props(styles.description).className,
              )}
            >
              {avatar.description}
            </span>
          )}
          <div className="bh-market-meta">
            <AvatarApplyCount count={avatar.applyCount} t={t} />
            {avatar.tags.map((tag) => (
              <Tag key={tag} tone="neutral" wrap>
                {tag}
              </Tag>
            ))}
          </div>
        </div>
        {detail.kind === 'loading' && (
          <div className="bh-market-state" role="status">
            {t('market.detail.loading')}
          </div>
        )}
        {detail.kind === 'failed' && (
          <ReadFailure
            retryLabel={t('market.retry')}
            onRetry={() => {
              setDetail({ kind: 'loading' });
              setReload((value) => value + 1);
            }}
          >
            {t('market.detail.error', { error: marketplaceError(detail.error, t) })}
          </ReadFailure>
        )}
        <ReportPanel report={report} t={t} kind="avatar" />
      </div>
    </MarketPage>
  );
}

export function MarketAvatarPublishDialog({
  actions,
  avatarSource,
  t,
  onClose,
  onPublished,
}: {
  actions: PublishActions;
  avatarSource?: string | undefined;
  t: BotHarnessTranslate;
  onClose: () => void;
  onPublished: (avatar: MarketplaceAvatar) => void;
}): ReactElement {
  const formId = useId();
  const [file, setFile] = useState<File>();
  const [sourceFile, setSourceFile] = useState<File>();
  const [sourceError, setSourceError] = useState<unknown>();
  const [sourceAttempt, setSourceAttempt] = useState(0);
  const [image, setImage] = useState<string>();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [account, setAccount] = useState<Read<MarketplaceAccount>>({ kind: 'loading' });
  const [authorName, setAuthorName] = useState<string>();
  const [terms, setTerms] = useState(false);
  const [signIn, setSignIn] = useState<ConnectSignInCode>();
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const lock = useRef(false);
  const requestKey = useRef<string>();
  const input = useRef<HTMLInputElement>(null);
  const sourceMount = useMountedResource<HTMLSpanElement>(() => {
    if (avatarSource === undefined) return;
    let subscribed = true;
    void actions
      .marketplaceAvatarSource(avatarSource)
      .then(({ image }) => {
        if (!subscribed) return;
        const separator = image.indexOf(',');
        const type = image.slice(5, image.indexOf(';'));
        const bytes = Uint8Array.from(atob(image.slice(separator + 1)), (byte) =>
          byte.charCodeAt(0),
        );
        const stored = new File([bytes], 'avatar', { type });
        setSourceFile(stored);
        setFile(stored);
      })
      .catch((cause: unknown) => {
        if (subscribed) setSourceError(cause);
      });
    return () => {
      subscribed = false;
    };
  }, [actions, avatarSource, sourceAttempt]);
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
  const signedIn = account.kind === 'ready' && account.value.signedIn;
  const issue = account.kind === 'ready' ? account.value.issue : undefined;
  const signInResource = useMountedResource<HTMLSpanElement>(
    () =>
      observeResource(
        'account',
        () => {
          if (!lock.current) setReload((value) => value + 1);
        },
        15_000,
        15_000,
        true,
      ),
    [actions, signIn],
  );
  const author = account.kind === 'ready' ? account.value.author : null;
  const readyAuthor = signedIn && author?.termsAcceptedAt != null ? author : undefined;
  const draftName = authorName ?? author?.name ?? '';
  const text = parseMarketplaceAvatarText({
    name,
    description,
    tags: tags.trim() ? tags.split(/[,，]/u) : [],
  });
  const allowed =
    readyAuthor !== undefined
      ? image !== undefined && text !== undefined
      : terms && draftName.trim().length > 0;

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
    if (account.kind !== 'ready' || !signedIn || !allowed) return;
    if (readyAuthor === undefined) {
      void run(async () => {
        const saved = await actions.marketplaceAuthorSave(draftName.trim(), true);
        setAccount({ kind: 'ready', value: { ...account.value, author: saved } });
      });
    } else if (image !== undefined && text !== undefined) {
      const key = (requestKey.current ??= crypto.randomUUID());
      void run(async () =>
        onPublished(
          await actions.marketplaceAvatarPublish({
            ...text,
            image,
            requestKey: key,
            confirm: true,
            expectedAuthorId: readyAuthor.id,
          }),
        ),
      );
    }
  };
  const close = () => {
    if (!lock.current) onClose();
  };

  return (
    <>
      <span ref={sourceMount} hidden />
      <PanelDialog
        title={t('market.avatar.publish')}
        size="small"
        closeLabel={t('common.close')}
        onClose={close}
        scroll
        bodyRef={mount}
        data={{ 'data-market-avatar-publish': readyAuthor === undefined ? 'account' : 'details' }}
        actions={
          signedIn ? (
            <Button variant="primary" type="submit" form={formId} disabled={busy || !allowed}>
              {t(
                readyAuthor === undefined
                  ? 'market.author.continue'
                  : busy
                    ? 'market.direct.uploading'
                    : 'market.avatar.publish',
              )}
            </Button>
          ) : undefined
        }
      >
        <StepProgress
          label={t('market.direct.progress')}
          steps={[t('market.direct.step.account'), t('market.direct.step.details')]}
          step={readyAuthor === undefined ? 0 : 1}
          titles="current"
        />
        {account.kind === 'loading' && <Note>{t('market.direct.loading')}</Note>}
        {account.kind === 'failed' && (
          <ReadFailure
            retryLabel={t('market.retry')}
            onRetry={() => {
              setAccount({ kind: 'loading' });
              setReload((value) => value + 1);
            }}
          >
            {t('market.direct.accountFailed', { error: marketplaceError(account.error, t) })}
          </ReadFailure>
        )}
        {account.kind === 'ready' && !signedIn && (
          <ConnectSignInBlock
            t={t}
            code={issue === undefined ? signIn : undefined}
            title={t('accountProfile.signInTitle')}
            body={t('market.direct.signInHint')}
            signInLabel={t('market.direct.signIn')}
            busy={busy}
            onSignIn={() =>
              void run(async () => {
                setSignIn(await startConnectSignIn());
                setAccount((current) =>
                  current.kind === 'ready'
                    ? {
                        kind: 'ready',
                        value: { signedIn: false, author: null },
                      }
                    : current,
                );
              })
            }
            codeMarker="data-market-sign-in"
            {...(issue === undefined
              ? {}
              : {
                  failed: t(
                    issue === 'relay-unavailable' || issue === 'relay-full'
                      ? 'accountProfile.signInRelay'
                      : 'accountProfile.signInFailed',
                  ),
                })}
          >
            {signIn !== undefined && issue === undefined && <span ref={signInResource} hidden />}
          </ConnectSignInBlock>
        )}
        {signedIn && (
          <form
            id={formId}
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <FieldStack>
              {readyAuthor === undefined ? (
                <>
                  <TextField
                    label={t('market.author.name')}
                    value={draftName}
                    maxLength={40}
                    initialFocus
                    onChange={setAuthorName}
                    disabled={busy}
                  />
                  <Checkbox checked={terms} onChange={setTerms} label={t('market.author.terms')} />
                </>
              ) : (
                <>
                  <span className="bh-market-owner">
                    {t('market.avatar.author', { name: readyAuthor.name, id: readyAuthor.id })}
                  </span>
                  <div {...stylex.props(styles.photoField)}>
                    {image !== undefined && (
                      <span
                        data-market-avatar-preview=""
                        role="img"
                        aria-label={t('market.avatar.preview')}
                      >
                        <PersonaBotAvatar
                          personaBotId={formId}
                          name={t('market.avatar.preview')}
                          src={image}
                          size={40}
                          still
                          preview
                          indicator={false}
                          nativeTitle={false}
                          t={t}
                        />
                      </span>
                    )}
                    {avatarSource === undefined && (
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
                    )}
                    <Button
                      variant="outline"
                      type="button"
                      size="sm"
                      disabled={busy || (avatarSource !== undefined && sourceFile === undefined)}
                      onClick={() => {
                        if (sourceFile !== undefined) setFile(sourceFile);
                        else input.current?.click();
                      }}
                    >
                      {t(
                        avatarSource === undefined
                          ? 'market.avatar.chooseFile'
                          : 'market.avatar.cropImage',
                      )}
                    </Button>
                  </div>
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
                  <Note>{t('market.avatar.publicNotice')}</Note>
                </>
              )}
            </FieldStack>
          </form>
        )}
        {error !== undefined && <Note tone="danger">{marketplaceError(error, t)}</Note>}
        {sourceError !== undefined && (
          <ReadFailure
            retryLabel={t('market.retry')}
            onRetry={() => {
              setSourceError(undefined);
              setSourceAttempt((attempt) => attempt + 1);
            }}
          >
            {marketplaceError(sourceError, t)}
          </ReadFailure>
        )}
      </PanelDialog>
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
