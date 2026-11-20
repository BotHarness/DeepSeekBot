import { useState, type KeyboardEvent, type ReactElement } from 'react';
import type { MarketplaceEntry } from './marketplace.js';
import type { BridgeActions } from './actions.js';
import type { BotHarnessTranslate } from './locale.js';
import { Button } from './ds/button.js';
import { Input } from './ds/input.js';
import { Note } from './ds/note.js';
import { marketplaceError, type Phase } from './marketplace-feedback.js';

export function committedEnter(event: KeyboardEvent<HTMLInputElement>): boolean {
  return event.key === 'Enter' && !event.nativeEvent.isComposing && event.keyCode !== 229;
}

export interface MarketplaceSubmit {
  readonly url: string;
  readonly phase: Phase;
  readonly cause: unknown | undefined;
  readonly submitted: string | undefined;
  setUrl(url: string): void;
  submit(): void;
}

export function useMarketplaceSubmission(
  actions: BridgeActions,
  onListed: (bot: MarketplaceEntry) => void,
  proveHuman: (actions: BridgeActions) => Promise<string>,
): MarketplaceSubmit {
  const [url, setUrl] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [cause, setCause] = useState<unknown | undefined>(undefined);
  const [submitted, setSubmitted] = useState<string | undefined>(undefined);
  return {
    url,
    phase,
    cause,
    submitted,
    setUrl,
    submit: () => {
      const trimmed = url.trim();
      if (trimmed.length === 0 || phase !== 'idle') return;
      setPhase('verifying');
      setCause(undefined);
      setSubmitted(undefined);
      void proveHuman(actions)
        .then((altcha) => {
          setPhase('sending');
          return actions.marketplaceSubmit(trimmed, altcha);
        })
        .then(
          (bot) => {
            setPhase('idle');
            setUrl('');
            setSubmitted(bot.fullName);
            onListed(bot);
          },
          (failure: unknown) => {
            setPhase('idle');
            setCause(failure);
          },
        );
    },
  };
}

export function MarketplaceSubmitField({
  submit,
  t,
}: {
  submit: MarketplaceSubmit;
  t: BotHarnessTranslate;
}): ReactElement {
  const busy = submit.phase !== 'idle';
  return (
    <>
      <div className="bh-market-submit">
        <Input
          aria-label={t('market.submit.label')}
          placeholder={t('market.submit.placeholder')}
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          value={submit.url}
          disabled={busy}
          onChange={(event) => submit.setUrl(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (!committedEnter(event)) return;
            event.preventDefault();
            submit.submit();
          }}
        />
        <Button
          variant="primary"
          disabled={busy || submit.url.trim().length === 0}
          onClick={submit.submit}
        >
          {submit.phase === 'verifying'
            ? t('market.challenge.verifying')
            : busy
              ? t('market.submit.busy')
              : t('market.submit.action')}
        </Button>
      </div>
      <span className="bh-market-hint">
        {submit.submitted === undefined
          ? t('market.submit.hint')
          : t('market.submit.done', { name: submit.submitted })}
      </span>
      {submit.cause === undefined ? null : (
        <Note tone="danger">{marketplaceError(submit.cause, t)}</Note>
      )}
    </>
  );
}
