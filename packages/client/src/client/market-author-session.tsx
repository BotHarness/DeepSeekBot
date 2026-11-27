import { useRef, useState, type ReactElement, type ReactNode } from 'react';

import type { BridgeActions } from './actions.js';
import { startConnectSignIn, type ConnectSignInCode } from './connect-sign-in.js';
import { ConnectSignInBlock } from './connect-sign-in-block.js';
import { Checkbox } from './ds/checkbox.js';
import { TextField } from './ds/field.js';
import { Note } from './ds/note.js';
import { ReadFailure } from './ds/read-failure.js';
import type { BotHarnessTranslate } from './locale.js';
import { marketplaceError } from './marketplace-feedback.js';
import { observeResource } from './messaging-defaults-live.js';
import { useMountedResource } from './mounted-resource.js';

export type MarketAuthorActions = Pick<
  BridgeActions,
  'marketplaceAccount' | 'marketplaceAuthorSave'
>;
type MarketplaceAccount = Awaited<ReturnType<BridgeActions['marketplaceAccount']>>;

type Read<T> =
  | { kind: 'loading' }
  | { kind: 'failed'; error: unknown }
  | { kind: 'ready'; value: T };

export function useMarketAuthorSession(actions: MarketAuthorActions) {
  const [account, setAccount] = useState<Read<MarketplaceAccount>>({ kind: 'loading' });
  const [authorName, setAuthorName] = useState<string>();
  const [terms, setTerms] = useState(false);
  const [signIn, setSignIn] = useState<ConnectSignInCode>();
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const lock = useRef(false);
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
  const signedIn = account.kind === 'ready' && account.value.signedIn;
  const author = account.kind === 'ready' ? account.value.author : null;
  const readyAuthor = signedIn && author?.termsAcceptedAt != null ? author : undefined;
  const draftName = authorName ?? author?.name ?? '';

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

  return {
    account,
    signedIn,
    readyAuthor,
    draftName,
    terms,
    signIn,
    signInResource,
    mount,
    busy,
    error,
    run,
    setAuthorName,
    setTerms,
    authorAllowed: terms && draftName.trim().length > 0,
    locked: () => lock.current,
    retry() {
      setAccount({ kind: 'loading' });
      setReload((value) => value + 1);
    },
    saveAuthor() {
      if (account.kind !== 'ready') return;
      const { value } = account;
      void run(async () => {
        const saved = await actions.marketplaceAuthorSave(draftName.trim(), true);
        setAccount({ kind: 'ready', value: { ...value, author: saved } });
      });
    },
    startSignIn() {
      void run(async () => {
        setSignIn(await startConnectSignIn());
        setAccount((current) =>
          current.kind === 'ready'
            ? { kind: 'ready', value: { signedIn: false, author: null } }
            : current,
        );
      });
    },
  };
}

export type MarketAuthorSession = ReturnType<typeof useMarketAuthorSession>;

export function MarketAuthorAccount({
  session,
  t,
}: {
  session: MarketAuthorSession;
  t: BotHarnessTranslate;
}): ReactNode {
  const { account, signedIn, signIn, busy } = session;
  if (account.kind === 'loading') return <Note>{t('market.direct.loading')}</Note>;
  if (account.kind === 'failed')
    return (
      <ReadFailure retryLabel={t('market.retry')} onRetry={session.retry}>
        {t('market.direct.accountFailed', { error: marketplaceError(account.error, t) })}
      </ReadFailure>
    );
  if (signedIn) return null;
  const { issue } = account.value;
  return (
    <ConnectSignInBlock
      t={t}
      code={issue === undefined ? signIn : undefined}
      title={t('accountProfile.signInTitle')}
      body={t('market.direct.signInHint')}
      signInLabel={t('market.direct.signIn')}
      busy={busy}
      onSignIn={session.startSignIn}
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
      {signIn !== undefined && issue === undefined && <span ref={session.signInResource} hidden />}
    </ConnectSignInBlock>
  );
}

export function MarketAuthorFields({
  session,
  t,
}: {
  session: MarketAuthorSession;
  t: BotHarnessTranslate;
}): ReactElement {
  return (
    <>
      <TextField
        label={t('market.author.name')}
        value={session.draftName}
        maxLength={40}
        initialFocus
        onChange={session.setAuthorName}
        disabled={session.busy}
      />
      <Checkbox
        checked={session.terms}
        onChange={session.setTerms}
        label={t('market.author.terms')}
      />
    </>
  );
}
