import { useRef, useState, useSyncExternalStore, type ReactElement, type ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button, Checkbox } from '@deepseek-ai/dsh-client-ui-primitives';

import type { MarketplaceEntry } from '../../../core/src/marketplace/client.js';
import type {
  MarketplaceAccount,
  UploadPlan,
} from '../../../core/src/marketplace/uploaded-bots.js';
import type { BridgeActions } from './actions.js';
import { PersonaBotAvatar } from './avatar.js';
import { errorMessage } from './bridge.js';
import { CHANNEL_BODY_PANEL } from './channel-dock-layout.js';
import { appendConversationDraft, conversationDraftKey } from './conversation-draft.js';
import type { DockPanelRegistry } from './dock-panels.js';
import { Callout } from './ds/callout.js';
import { ChoiceButton } from './ds/choice-button.js';
import { FieldStack, TextAreaField, TextField } from './ds/field.js';
import { Note } from './ds/note.js';
import { PanelDialog } from './ds/panel-dialog.js';
import { StepProgress } from './ds/step-progress.js';
import { color, radius, space, text } from './ds/tokens.stylex.js';
import type { BotHarnessKey, BotHarnessTranslate } from './locale.js';
import { fileSize } from './market-files.js';
import { MARKET_SHARE_PROMPT } from './market-share-prompt.js';
import {
  MarketplaceSubmitField,
  marketplaceError,
  marketplaceLanguage,
  useMarketplaceSubmit,
} from './marketplace.js';
import { useMountedResource } from './mounted-resource.js';
import { store, type BotSummary } from './store.js';

const CONNECT_PATH = './api/botharness/devices/connect';
const ACCOUNT_POLL_MS = 3000;
const MAX_AUTHOR_NAME_LENGTH = 40;
const MAX_TAGS = 8;

type Route = 'choose' | 'direct' | 'github' | 'repo';
type DirectStep = 'account' | 'bot' | 'details' | 'review';

const DIRECT_STEPS: readonly DirectStep[] = ['account', 'bot', 'details', 'review'];

const TITLES: Record<Route, BotHarnessKey> = {
  choose: 'market.upload.title',
  direct: 'market.direct.title',
  github: 'market.upload.byBot',
  repo: 'market.upload.byUrl',
};

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

export function MarketUploadDialog({
  actions,
  registry,
  t,
  onListed,
  onClose,
  initialSlug,
}: {
  actions: BridgeActions;
  registry: DockPanelRegistry;
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
  const [rawStep, setStep] = useState<DirectStep>(
    preselected === undefined ? 'account' : 'details',
  );
  const [chosen, setChosen] = useState<BotSummary | undefined>(preselected);
  const [account, setAccount] = useState<AccountState>({ status: 'loading' });
  const [signIn, setSignIn] = useState<{ userCode: string; verificationUri: string }>();
  const [authorName, setAuthorName] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [name, setName] = useState(preselected?.displayName ?? '');
  const [bio, setBio] = useState(preselected?.description ?? '');
  const [tags, setTags] = useState(preselected?.roles.join(', ') ?? '');
  const [plan, setPlan] = useState<{ value?: UploadPlan; cause?: unknown }>({});
  const [checked, setChecked] = useState(false);
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
    if (preselected !== undefined) loadPlan(preselected);
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
  const step: DirectStep =
    rawStep === 'account' && accountDone ? (chosen === undefined ? 'bot' : 'details') : rawStep;

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
    setChecked(false);
    loadPlan(bot);
    go('details');
  };

  const publishByBot = (bot: BotSummary): Promise<void> =>
    run(async () => {
      await actions.openBot(bot.slug);
      const scope = conversationDraftKey(store.getSnapshot());
      if (scope !== undefined)
        appendConversationDraft(scope, MARKET_SHARE_PROMPT[marketplaceLanguage(t)]);
      registry.open(CHANNEL_BODY_PANEL);
      onClose();
    });

  const back = (): void => {
    setCause(undefined);
    if (route !== 'direct') setRoute('choose');
    else if (step === 'review') go('details');
    else if (step === 'details' && preselected === undefined) go('bot');
    else {
      setStep('account');
      setRoute('choose');
    }
  };

  const failure =
    cause === undefined ? null : (
      <Note tone="danger">
        {route === 'github'
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
          title={t('market.upload.byBot')}
          description={t('market.upload.route.githubHint')}
          data={{ 'data-market-route': 'github' }}
          onClick={() => {
            setCause(undefined);
            setRoute('github');
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
  } else if (route === 'github') {
    body = (
      <>
        <Note>{t('market.upload.byBotHint')}</Note>
        <BotChoices bots={bots} t={t} disabled={busy} onChoose={(bot) => void publishByBot(bot)} />
        {failure}
      </>
    );
  } else if (route === 'repo') {
    body = <MarketplaceSubmitField submit={submit} t={t} />;
  } else {
    let content: ReactNode;
    if (step === 'account') {
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
    } else if (step === 'bot') {
      content = <BotChoices bots={bots} t={t} onChoose={choose} />;
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
          <Callout tone="warning" title={t('market.direct.secretsTitle')}>
            <Checkbox checked={checked} onChange={setChecked} label={t('market.direct.secrets')} />
          </Callout>
        </>
      );
      primary = (
        <Button
          variant="primary"
          disabled={busy || !checked || files === undefined || files.files.length === 0}
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
    body = (
      <>
        <StepProgress
          label={t('market.direct.progress')}
          steps={DIRECT_STEPS.map((id) => t(`market.direct.step.${id}`))}
          step={DIRECT_STEPS.indexOf(step)}
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
