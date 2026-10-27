import { useRef, useState, type ReactElement } from 'react';

import { Button, Checkbox } from '@deepseek-ai/dsh-client-ui-primitives';

import type { MarketplaceEntry } from '../../../core/src/marketplace/client.js';
import type {
  MarketplaceAccount,
  UploadPlan,
} from '../../../core/src/marketplace/uploaded-bots.js';
import type { BridgeActions } from './actions.js';
import { PersonaBotAvatar } from './avatar.js';
import { Callout } from './ds/callout.js';
import { FieldStack, TextAreaField, TextField } from './ds/field.js';
import { Note } from './ds/note.js';
import type { BotHarnessTranslate } from './locale.js';
import { fileSize } from './market-files.js';
import { marketplaceError } from './marketplace.js';
import { useMountedResource } from './mounted-resource.js';
import type { BotSummary } from './store.js';

const CONNECT_PATH = './api/botharness/devices/connect';
const ACCOUNT_POLL_MS = 3000;
const MAX_AUTHOR_NAME_LENGTH = 40;
const MAX_TAGS = 8;

type AccountState =
  | { status: 'loading' }
  | { status: 'error'; cause: unknown }
  | { status: 'ready'; account: MarketplaceAccount };

type Step =
  | { kind: 'pick' }
  | { kind: 'author'; bot: BotSummary }
  | { kind: 'form'; bot: BotSummary; plan?: UploadPlan; planCause?: unknown };

function tagList(text: string): string[] {
  const tags: string[] = [];
  for (const part of text.split(/[,，]/u)) {
    const tag = part.trim();
    if (tag.length > 0 && !tags.includes(tag)) tags.push(tag);
  }
  return tags.slice(0, MAX_TAGS);
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

export function MarketDirectUpload({
  actions,
  bots,
  t,
  onListed,
}: {
  actions: BridgeActions;
  bots: readonly BotSummary[];
  t: BotHarnessTranslate;
  onListed: (bot: MarketplaceEntry) => void;
}): ReactElement {
  const [account, setAccount] = useState<AccountState>({ status: 'loading' });
  const [signIn, setSignIn] = useState<{ userCode: string; verificationUri: string }>();
  const [step, setStep] = useState<Step>({ kind: 'pick' });
  const [authorName, setAuthorName] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [tags, setTags] = useState('');
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

  const mount = useMountedResource<HTMLDivElement>(() => {
    mounted.current = true;
    void loadAccount();
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

  const openForm = (bot: BotSummary): void => {
    setName(bot.displayName);
    setBio(bot.description ?? '');
    setTags(bot.roles.join(', '));
    setCause(undefined);
    setStep({ kind: 'form', bot });
    void actions.marketplaceUploadPlan(bot.slug).then(
      (plan) => {
        if (mounted.current) setStep({ kind: 'form', bot, plan });
      },
      (planCause: unknown) => {
        if (mounted.current) setStep({ kind: 'form', bot, planCause });
      },
    );
  };

  const choose = (bot: BotSummary): void => {
    if (account.status !== 'ready') return;
    if (account.account.author === null) {
      setCause(undefined);
      setStep({ kind: 'author', bot });
    } else openForm(bot);
  };

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

  const failure =
    cause === undefined ? null : <Note tone="danger">{marketplaceError(cause, t)}</Note>;

  const content = ((): ReactElement => {
    if (account.status === 'loading')
      return (
        <span className="bh-market-state" role="status">
          {t('market.direct.loading')}
        </span>
      );
    if (account.status === 'error')
      return (
        <Note tone="danger">
          {t('market.direct.accountFailed', { error: marketplaceError(account.cause, t) })}
        </Note>
      );

    if (!account.account.signedIn)
      return (
        <div className="bh-market-direct" data-market-direct="signed-out">
          <span className="bh-market-hint">{t('market.direct.signInHint')}</span>
          {signIn === undefined ? (
            <div>
              <Button
                size="sm"
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
            </div>
          ) : (
            <Callout data={{ 'data-market-sign-in': '' }}>
              {t('devices.connect.confirm')}{' '}
              <code className="bh-market-code">{signIn.userCode}</code>
              <div>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => window.open(signIn.verificationUri, '_blank', 'noopener')}
                >
                  {t('devices.connect.openPage')}
                </Button>
              </div>
            </Callout>
          )}
          {failure}
        </div>
      );

    const author = account.account.author;

    if (step.kind === 'author')
      return (
        <div className="bh-market-direct" data-market-direct="author">
          <FieldStack>
            <TextField
              label={t('market.author.name')}
              hint={t('market.author.nameHint')}
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
          {failure}
          <div className="bh-market-direct-actions">
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => setStep({ kind: 'pick' })}
            >
              {t('market.back')}
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={busy || authorName.trim().length === 0 || !acceptTerms}
              onClick={() =>
                void run(async () => {
                  const saved = await actions.marketplaceAuthorSave(authorName.trim(), true);
                  if (!mounted.current) return;
                  setAccount({ status: 'ready', account: { ...account.account, author: saved } });
                  openForm(step.bot);
                })
              }
            >
              {t('market.author.continue')}
            </Button>
          </div>
        </div>
      );

    if (step.kind === 'form') {
      const { bot, plan } = step;
      return (
        <div className="bh-market-direct" data-market-direct="form">
          <div className="bh-market-direct-head">
            <PersonaBotAvatar
              personaBotId={bot.slug}
              name={bot.displayName}
              src={bot.avatar}
              appearance={bot.appearance}
              avatarSeed={bot.avatarSeed}
              size={40}
              indicator={false}
              still
              t={t}
            />
            <span className="bh-market-copy">
              <span className="bh-market-card-name">{bot.displayName}</span>
              {author === null ? null : (
                <span className="bh-market-owner" data-market-author-id={author.id}>
                  {t('market.direct.as', { name: author.name, id: author.id })}
                </span>
              )}
            </span>
          </div>
          <FieldStack>
            <TextField
              label={t('market.direct.name')}
              value={name}
              maxLength={60}
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
              hint={t('market.direct.tagsHint')}
              value={tags}
              onChange={setTags}
            />
          </FieldStack>
          <span className="bh-market-hint" data-market-plan={plan?.files.length ?? ''}>
            {plan === undefined
              ? step.planCause === undefined
                ? t('market.direct.planLoading')
                : marketplaceError(step.planCause, t)
              : t('market.direct.plan', {
                  count: String(plan.files.length),
                  size: fileSize(plan.totalBytes),
                })}
          </span>
          {plan === undefined || plan.skipped.length === 0 ? null : (
            <span className="bh-market-hint" data-market-skipped={plan.skipped.length}>
              {t('market.direct.skipped', {
                files: plan.skipped.map((file) => file.path).join(', '),
              })}
            </span>
          )}
          <Callout tone="warning" role="note" title={t('market.direct.secretsTitle')}>
            {t('market.direct.secrets')}
          </Callout>
          {failure}
          <div className="bh-market-direct-actions">
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => setStep({ kind: 'pick' })}
            >
              {t('market.back')}
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={busy || plan === undefined || plan.files.length === 0 || !name.trim()}
              onClick={() =>
                void run(async () => {
                  const trimmedBio = bio.trim();
                  const uploaded = await actions.marketplaceUpload(bot.slug, {
                    displayName: name.trim(),
                    ...(trimmedBio.length === 0 ? {} : { bio: trimmedBio }),
                    tags: tagList(tags),
                  });
                  if (mounted.current) onListed(uploaded.bot);
                })
              }
            >
              {busy ? t('market.direct.uploading') : t('market.direct.upload')}
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="bh-market-direct" data-market-direct="pick">
        <span className="bh-market-hint">
          {author === null
            ? t('market.direct.pickHint')
            : t('market.direct.as', { name: author.name, id: author.id })}
        </span>
        {bots.length === 0 ? (
          <span className="bh-market-state">{t('market.upload.noBots')}</span>
        ) : (
          <div className="bh-market-upload-bots" role="list">
            {bots.map((bot) => (
              <div key={bot.slug} className="bh-market-upload-bot" role="listitem">
                <PersonaBotAvatar
                  personaBotId={bot.slug}
                  name={bot.displayName}
                  src={bot.avatar}
                  appearance={bot.appearance}
                  avatarSeed={bot.avatarSeed}
                  size={28}
                  indicator={false}
                  still
                  t={t}
                />
                <span className="bh-market-upload-name">{bot.displayName}</span>
                <Button
                  size="sm"
                  variant="primary"
                  aria-label={t('market.direct.uploadLabel', { name: bot.displayName })}
                  onClick={() => choose(bot)}
                >
                  {t('market.direct.choose')}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  })();

  return (
    <div ref={mount} className="bh-market-direct-root">
      {content}
      {signIn === undefined ? null : <span ref={poll} hidden />}
    </div>
  );
}
