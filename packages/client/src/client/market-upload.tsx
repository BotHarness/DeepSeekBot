import { useRef, useState, useSyncExternalStore, type ReactElement, type ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button, Checkbox } from '@deepseek-ai/dsh-client-ui-primitives';

import type { ShareDraftView } from '../../../core/src/marketplace/share-draft.js';
import type { MarketplaceEntry } from '../../../core/src/marketplace/client.js';
import type {
  MarketplaceAccount,
  UploadPlan,
} from '../../../core/src/marketplace/uploaded-bots.js';
import type { BridgeActions } from './actions.js';
import { PersonaBotAvatar } from './avatar.js';
import { errorMessage } from './bridge.js';
import { CHANNEL_BODY_PANEL } from './channel-dock-layout.js';
import type { DockPanelRegistry } from './dock-panels.js';
import { ChoiceButton } from './ds/choice-button.js';
import { FieldStack, TextAreaField, TextField } from './ds/field.js';
import { Note } from './ds/note.js';
import { PanelDialog } from './ds/panel-dialog.js';
import { StepProgress } from './ds/step-progress.js';
import { color, radius, space, text } from './ds/tokens.stylex.js';
import type { BotHarnessKey, BotHarnessTranslate } from './locale.js';
import { fileSize } from './market-files.js';
import { watchShareDraft } from './share-flow.js';
import {
  MarketplaceSubmitField,
  marketplaceError,
  useMarketplaceSubmit,
} from './marketplace.js';
import { useMountedResource } from './mounted-resource.js';
import { store, type BotSummary } from './store.js';

const CONNECT_PATH = './api/botharness/devices/connect';
const ACCOUNT_POLL_MS = 3000;
const MAX_AUTHOR_NAME_LENGTH = 40;
const MAX_TAGS = 8;

type Route = 'choose' | 'direct' | 'repo';
type DirectStep = 'bot' | 'draft' | 'where' | 'account' | 'details' | 'review' | 'github';
type Destination = 'market' | 'github';

const STEPS: Record<Destination, readonly DirectStep[]> = {
  market: ['bot', 'draft', 'where', 'account', 'details', 'review'],
  github: ['bot', 'draft', 'where', 'github'],
};

const TITLES: Record<Route, BotHarnessKey> = {
  choose: 'market.upload.title',
  direct: 'market.direct.title',
  repo: 'market.upload.byUrl',
};

type DraftState =
  | { status: 'loading' }
  | { status: 'error'; cause: unknown }
  | { status: 'ready'; draft: ShareDraftView | undefined };

type AccountState =
  | { status: 'loading' }
  | { status: 'error'; cause: unknown }
  | { status: 'ready'; account: MarketplaceAccount };

const styles = stylex.create({
  body: { display: 'flex', flexDirection: 'column', gap: space.x5, minWidth: 0 },
  choices: { display: 'flex', flexDirection: 'column', gap: space.x3, minWidth: 0 },
  code: {
    alignSelf: 'center',
    paddingBlock: space.x3,
    paddingInline: space.x5,
    borderRadius: radius.sm,
    backgroundColor: color.surface,
    color: color.fg,
    fontFamily: 'var(--dsw-font-mono, ui-monospace, monospace)',
    fontSize: text.titleSize,
    lineHeight: text.titleLine,
    fontWeight: text.strong,
    letterSpacing: '0.12em',
    userSelect: 'all',
  },
  summary: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x4,
    padding: space.x4,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    minWidth: 0,
  },
  summaryCopy: { display: 'flex', flexDirection: 'column', gap: space.x1, minWidth: 0 },
  summaryName: {
    color: color.fg,
    fontSize: text.titleSize,
    lineHeight: text.titleLine,
    fontWeight: text.strong,
  },
  summaryMeta: {
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    fontFeatureSettings: '"calt" 0',
    overflowWrap: 'anywhere',
  },
});

function tagList(value: string): string[] {
  const tags: string[] = [];
  for (const part of value.split(/[,，]/u)) {
    const tag = part.trim();
    if (tag.length > 0 && !tags.includes(tag)) tags.push(tag);
  }
  return tags.slice(0, MAX_TAGS);
}

function publishable(bots: readonly BotSummary[]): BotSummary[] {
  return bots.filter((bot) => !bot.deleted && bot.tob === undefined);
}

async function startConnectSignIn(): Promise<{ userCode: string; verificationUri: string }> {
  const response = await fetch(CONNECT_PATH, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'sign-in' }),
    credentials: 'same-origin',
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (
    !response.ok ||
    typeof body['userCode'] !== 'string' ||
    typeof body['verificationUri'] !== 'string'
  )
    throw new Error(typeof body['code'] === 'string' ? body['code'] : 'sign-in-unavailable');
  return { userCode: body['userCode'], verificationUri: body['verificationUri'] };
}

function BotAvatar({
  bot,
  size,
  t,
}: {
  bot: BotSummary;
  size: number;
  t: BotHarnessTranslate;
}): ReactElement {
  return (
    <PersonaBotAvatar
      personaBotId={bot.slug}
      name={bot.displayName}
      src={bot.avatar}
      appearance={bot.appearance}
      avatarSeed={bot.avatarSeed}
      size={size}
      indicator={false}
      still
      t={t}
    />
  );
}

function BotChoices({
  bots,
  t,
  disabled = false,
  onChoose,
}: {
  bots: readonly BotSummary[];
  t: BotHarnessTranslate;
  disabled?: boolean;
  onChoose: (bot: BotSummary) => void;
}): ReactElement {
  if (bots.length === 0) return <Note>{t('market.upload.noBots')}</Note>;
  return (
    <div {...stylex.props(styles.choices)} role="list">
      {bots.map((bot) => (
        <div key={bot.slug} role="listitem">
          <ChoiceButton
            title={bot.displayName}
            leading={<BotAvatar bot={bot} size={28} t={t} />}
            disabled={disabled}
            data={{ 'data-market-bot-choice': bot.slug }}
            onClick={() => onChoose(bot)}
          />
        </div>
      ))}
    </div>
  );
}

function DraftSummary({
  bot,
  meta,
  t,
}: {
  bot: BotSummary;
  meta: string;
  t: BotHarnessTranslate;
}): ReactElement {
  return (
    <div {...stylex.props(styles.summary)}>
      <BotAvatar bot={bot} size={40} t={t} />
      <span {...stylex.props(styles.summaryCopy)}>
        <span {...stylex.props(styles.summaryName)}>{bot.displayName}</span>
        <span {...stylex.props(styles.summaryMeta)} data-market-draft-meta="">
          {meta}
        </span>
      </span>
    </div>
  );
}

export function MarketUploadDialog({
  actions,
  registry,
  t,
  onListed,
  onClose,
  initialSlug,
}: {
  actions: BridgeActions;
  registry?: Pick<DockPanelRegistry, 'open'> | undefined;
  t: BotHarnessTranslate;
  onListed: (bot: MarketplaceEntry) => void;
  onClose: () => void;
  initialSlug?: string | undefined;
}): ReactElement {
  const roster = useSyncExternalStore(store.subscribe, () => store.getSnapshot().bots);
  const bots = publishable(roster);
  const preselected = bots.find((bot) => bot.slug === initialSlug);
  const submit = useMarketplaceSubmit(actions, (bot) => {
    onListed(bot);
    onClose();
  });
  const [route, setRoute] = useState<Route>(preselected === undefined ? 'choose' : 'direct');
  const [rawStep, setStep] = useState<DirectStep>(preselected === undefined ? 'bot' : 'draft');
  const [destination, setDestination] = useState<Destination>('market');
  const [chosen, setChosen] = useState<BotSummary | undefined>(preselected);
  const [draft, setDraft] = useState<DraftState>({ status: 'loading' });
  const [account, setAccount] = useState<AccountState>({ status: 'loading' });
  const [signIn, setSignIn] = useState<{ userCode: string; verificationUri: string }>();
  const [authorName, setAuthorName] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [name, setName] = useState(preselected?.displayName ?? '');
  const [bio, setBio] = useState(preselected?.description ?? '');
  const [tags, setTags] = useState(preselected?.roles.join(', ') ?? '');
  const [plan, setPlan] = useState<{ value?: UploadPlan; cause?: unknown }>({});
  const [busy, setBusy] = useState(false);
  const [cause, setCause] = useState<unknown>();
  const mounted = useRef(true);

  const loadAccount = async (): Promise<MarketplaceAccount | undefined> => {
    try {
      const loaded = await actions.marketplaceAccount();
      if (mounted.current) setAccount({ status: 'ready', account: loaded });
      return loaded;
    } catch (failure) {
      if (mounted.current) setAccount({ status: 'error', cause: failure });
      return undefined;
    }
  };

  const loadDraft = (bot: BotSummary): void => {
    setDraft({ status: 'loading' });
    void actions.shareDraftGet(bot.slug).then(
      (value) => {
        if (mounted.current) setDraft({ status: 'ready', draft: value });
      },
      (failure: unknown) => {
        if (mounted.current) setDraft({ status: 'error', cause: failure });
      },
    );
  };

  const loadPlan = (bot: BotSummary): void => {
    setPlan({});
    void actions.marketplaceUploadPlan(bot.slug).then(
      (value) => {
        if (mounted.current) setPlan({ value });
      },
      (planCause: unknown) => {
        if (mounted.current) setPlan({ cause: planCause });
      },
    );
  };

  const mount = useMountedResource<HTMLDivElement>(() => {
    mounted.current = true;
    void loadAccount();
    if (preselected !== undefined) loadDraft(preselected);
    return () => {
      mounted.current = false;
    };
  }, []);

  const poll = useMountedResource<HTMLSpanElement>(() => {
    const timer = setInterval(() => {
      void loadAccount().then((loaded) => {
        if (loaded?.signedIn === true && mounted.current) setSignIn(undefined);
      });
    }, ACCOUNT_POLL_MS);
    return () => clearInterval(timer);
  }, [signIn]);

  const ready = account.status === 'ready' ? account.account : undefined;
  const author = ready?.author ?? null;
  const accountDone = ready?.signedIn === true && author !== null;
  const step: DirectStep = rawStep === 'account' && accountDone ? 'details' : rawStep;
  const shareDraft = draft.status === 'ready' ? draft.draft : undefined;

  const run = async (work: () => Promise<void>): Promise<void> => {
    setBusy(true);
    setCause(undefined);
    try {
      await work();
    } catch (failure) {
      if (mounted.current) setCause(failure);
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const go = (next: DirectStep): void => {
    setCause(undefined);
    setStep(next);
  };

  const choose = (bot: BotSummary): void => {
    setChosen(bot);
    setName(bot.displayName);
    setBio(bot.description ?? '');
    setTags(bot.roles.join(', '));
    loadDraft(bot);
    go('draft');
  };

  const askTob = async (message: string): Promise<void> => {
    const home = await actions.tobHome();
    await actions.sendHome(home.channelId, message, 'human-' + crypto.randomUUID());
    registry?.open(CHANNEL_BODY_PANEL);
    onClose();
  };

  const check = (bot: BotSummary): Promise<void> =>
    run(async () => {
      if (shareDraft === undefined) await actions.shareDraftStart(bot.slug);
      watchShareDraft(bot.slug);
      await askTob(t('market.draft.message', { name: bot.displayName, slug: bot.slug }));
    });

  const pushToGithub = (bot: BotSummary): Promise<void> =>
    run(async () => {
      const exported = await actions.shareDraftExport(bot.slug);
      await askTob(
        t('market.github.message', { name: bot.displayName, path: exported.path, slug: bot.slug }),
      );
    });

  const back = (): void => {
    setCause(undefined);
    if (route !== 'direct') setRoute('choose');
    else if (step === 'review') go('details');
    else if (step === 'details') go(accountDone ? 'where' : 'account');
    else if (step === 'account' || step === 'github') go('where');
    else if (step === 'where') go('draft');
    else if (step === 'draft' && preselected === undefined) go('bot');
    else setRoute('choose');
  };

  const failure =
    cause === undefined ? null : (
      <Note tone="danger">
        {step === 'draft' || step === 'github'
          ? t('market.upload.failed', { error: errorMessage(cause) })
          : marketplaceError(cause, t)}
      </Note>
    );

  let body: ReactNode;
  let primary: ReactNode = null;

  if (route === 'choose') {
    body = (
      <div {...stylex.props(styles.choices)}>
        <ChoiceButton
          title={t('market.direct.title')}
          description={t('market.upload.route.directHint')}
          data={{ 'data-market-route': 'direct' }}
          onClick={() => {
            setCause(undefined);
            setRoute('direct');
          }}
        />
        <ChoiceButton
          title={t('market.upload.byUrl')}
          description={t('market.upload.route.repoHint')}
          data={{ 'data-market-route': 'repo' }}
          onClick={() => setRoute('repo')}
        />
      </div>
    );
  } else if (route === 'repo') {
    body = <MarketplaceSubmitField submit={submit} t={t} />;
  } else {
    let content: ReactNode;
    if (step === 'bot') {
      content = <BotChoices bots={bots} t={t} onChoose={choose} />;
    } else if (step === 'draft' && chosen !== undefined) {
      if (draft.status === 'loading') content = <Note>{t('market.direct.planLoading')}</Note>;
      else if (draft.status === 'error')
        content = <Note tone="danger">{marketplaceError(draft.cause, t)}</Note>;
      else {
        const summary = draft.draft?.summary;
        const done = summary === undefined ? 0 : summary.total - summary.pending;
        content = (
          <DraftSummary
            bot={chosen}
            t={t}
            meta={
              summary === undefined
                ? t('market.draft.hint')
                : draft.draft?.state === 'ready'
                  ? t('market.draft.result', {
                      kept: String(summary.kept),
                      rewritten: String(summary.rewritten),
                      dropped: String(summary.dropped),
                    })
                  : t('market.draft.progress', {
                      done: String(done),
                      total: String(summary.total),
                    })
            }
          />
        );
        primary =
          draft.draft?.state === 'ready' ? (
            <Button variant="primary" onClick={() => go('where')}>
              {t('market.direct.next')}
            </Button>
          ) : (
            <Button variant="primary" disabled={busy} onClick={() => void check(chosen)}>
              {draft.draft === undefined ? t('market.draft.check') : t('market.draft.continue')}
            </Button>
          );
      }
    } else if (step === 'where') {
      content = (
        <div {...stylex.props(styles.choices)}>
          <ChoiceButton
            title={t('market.where.market')}
            data={{ 'data-market-destination': 'market' }}
            onClick={() => {
              setDestination('market');
              if (chosen !== undefined) loadPlan(chosen);
              go('account');
            }}
          />
          <ChoiceButton
            title={t('market.where.github')}
            description={t('market.where.githubHint')}
            data={{ 'data-market-destination': 'github' }}
            onClick={() => {
              setDestination('github');
              go('github');
            }}
          />
        </div>
      );
    } else if (step === 'github' && chosen !== undefined) {
      content = <DraftSummary bot={chosen} t={t} meta={t('market.github.hint')} />;
      primary = (
        <Button variant="primary" disabled={busy} onClick={() => void pushToGithub(chosen)}>
          {t('market.github.push')}
        </Button>
      );
    } else if (step === 'account') {
      if (account.status === 'loading') content = <Note>{t('market.direct.loading')}</Note>;
      else if (account.status === 'error')
        content = (
          <Note tone="danger">
            {t('market.direct.accountFailed', { error: marketplaceError(account.cause, t) })}
          </Note>
        );
      else if (!account.account.signedIn) {
        content =
          signIn === undefined ? (
            <Note>{t('market.direct.signInHint')}</Note>
          ) : (
            <>
              <Note>{t('devices.connect.confirm')}</Note>
              <code {...stylex.props(styles.code)} data-market-sign-in="">
                {signIn.userCode}
              </code>
              <span ref={poll} hidden />
            </>
          );
        primary =
          signIn === undefined ? (
            <Button
              variant="primary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const started = await startConnectSignIn();
                  if (mounted.current) setSignIn(started);
                })
              }
            >
              {t('market.direct.signIn')}
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={() => window.open(signIn.verificationUri, '_blank', 'noopener')}
            >
              {t('devices.connect.openPage')}
            </Button>
          );
      } else {
        content = (
          <FieldStack>
            <TextField
              label={t('market.author.name')}
              value={authorName}
              maxLength={MAX_AUTHOR_NAME_LENGTH}
              initialFocus
              onChange={setAuthorName}
            />
            <Checkbox
              checked={acceptTerms}
              onChange={setAcceptTerms}
              label={t('market.author.terms')}
            />
          </FieldStack>
        );
        primary = (
          <Button
            variant="primary"
            disabled={busy || authorName.trim().length === 0 || !acceptTerms}
            onClick={() =>
              void run(async () => {
                const saved = await actions.marketplaceAuthorSave(authorName.trim(), true);
                if (mounted.current && ready !== undefined)
                  setAccount({ status: 'ready', account: { ...ready, author: saved } });
              })
            }
          >
            {t('market.author.continue')}
          </Button>
        );
      }
    } else if (step === 'details') {
      content = (
        <FieldStack>
          <TextField
            label={t('market.direct.name')}
            value={name}
            maxLength={60}
            initialFocus
            onChange={setName}
          />
          <TextAreaField
            label={t('market.direct.bio')}
            value={bio}
            maxLength={160}
            rows={2}
            onChange={setBio}
          />
          <TextField
            label={t('market.direct.tags')}
            placeholder={t('market.direct.tagsHint')}
            value={tags}
            onChange={setTags}
          />
        </FieldStack>
      );
      primary = (
        <Button variant="primary" disabled={!name.trim()} onClick={() => go('review')}>
          {t('market.direct.next')}
        </Button>
      );
    } else {
      const files = plan.value;
      content = (
        <>
          {chosen === undefined ? null : (
            <div {...stylex.props(styles.summary)}>
              <BotAvatar bot={chosen} size={40} t={t} />
              <span {...stylex.props(styles.summaryCopy)}>
                <span {...stylex.props(styles.summaryName)}>{name.trim()}</span>
                <span
                  {...stylex.props(styles.summaryMeta)}
                  data-market-plan={files?.files.length ?? ''}
                >
                  {[
                    author === null ? undefined : `${author.name} #${author.id}`,
                    files === undefined
                      ? plan.cause === undefined
                        ? t('market.direct.planLoading')
                        : marketplaceError(plan.cause, t)
                      : t('market.direct.plan', {
                          count: String(files.files.length),
                          size: fileSize(files.totalBytes),
                        }),
                  ]
                    .filter((part) => part !== undefined)
                    .join(' · ')}
                </span>
              </span>
            </div>
          )}
          {files === undefined || files.skipped.length === 0 ? null : (
            <Note>
              {t('market.direct.skipped', {
                files: files.skipped.map((file) => file.path).join(', '),
              })}
            </Note>
          )}
        </>
      );
      primary = (
        <Button
          variant="primary"
          disabled={busy || files === undefined || files.files.length === 0}
          onClick={() =>
            void run(async () => {
              if (chosen === undefined) return;
              const trimmedBio = bio.trim();
              const uploaded = await actions.marketplaceUpload(chosen.slug, {
                displayName: name.trim(),
                ...(trimmedBio.length === 0 ? {} : { bio: trimmedBio }),
                tags: tagList(tags),
              });
              if (!mounted.current) return;
              onListed(uploaded.bot);
              onClose();
            })
          }
        >
          {busy ? t('market.direct.uploading') : t('market.direct.upload')}
        </Button>
      );
    }
    const steps = STEPS[destination];
    body = (
      <>
        <StepProgress
          label={t('market.direct.progress')}
          steps={steps.map((id) => t(`market.direct.step.${id}`))}
          step={steps.indexOf(step)}
        />
        <div {...stylex.props(styles.body)} data-market-direct={step}>
          {content}
          {failure}
        </div>
      </>
    );
  }

  return (
    <PanelDialog
      size="small"
      title={t(TITLES[route])}
      closeLabel={t('common.close')}
      onClose={onClose}
      scroll
      data={{ 'data-market-upload': route }}
      secondary={
        route === 'choose' ? undefined : (
          <Button variant="outline" disabled={busy} onClick={back}>
            {t('market.back')}
          </Button>
        )
      }
      actions={primary ?? undefined}
    >
      <div ref={mount} {...stylex.props(styles.body)}>
        {body}
      </div>
    </PanelDialog>
  );
}
