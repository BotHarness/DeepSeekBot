import { useRef, useState, type ReactElement } from 'react';
import type { MarketplaceAvatarApplyCandidate } from '@botharness/host-protocol/marketplace-avatar';
import type { BridgeActions } from './actions.js';
import { BotChoiceList } from './bot-choice-list.js';
import { FormDialog } from './ds/form-dialog.js';
import { Note } from './ds/note.js';
import { ReadFailure } from './ds/read-failure.js';
import type { BotHarnessTranslate } from './locale.js';
import { marketplaceError } from './marketplace-feedback.js';
import { useMountedResource } from './mounted-resource.js';

export type AvatarApplyActions = Pick<
  BridgeActions,
  'marketplaceAvatarApplyCandidates' | 'marketplaceAvatarApply'
>;

export function MarketAvatarApplyDialog({
  id,
  actions,
  t,
  onClose,
  onApplied,
}: {
  id: string;
  actions: AvatarApplyActions;
  t: BotHarnessTranslate;
  onClose(): void;
  onApplied(bot: MarketplaceAvatarApplyCandidate): void;
}): ReactElement {
  const [bots, setBots] = useState<MarketplaceAvatarApplyCandidate[]>();
  const [selected, select] = useState<string>();
  const [readError, setReadError] = useState<unknown>();
  const [writeError, setWriteError] = useState<unknown>();
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const bot = bots?.find(({ slug }) => slug === selected);
  const mount = useMountedResource<HTMLDivElement>(() => {
    let subscribed = true;
    void actions.marketplaceAvatarApplyCandidates().then(
      ({ bots: candidates }) => {
        if (subscribed) setBots(candidates);
      },
      (error: unknown) => {
        if (subscribed) setReadError(error);
      },
    );
    return () => {
      subscribed = false;
    };
  }, [actions, reload]);

  const submit = async () => {
    if (bot === undefined || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setWriteError(undefined);
    try {
      await actions.marketplaceAvatarApply(id, bot.slug);
      onApplied(bot);
    } catch (error) {
      setWriteError(error);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  return (
    <FormDialog
      title={t('market.avatar.applyTitle')}
      labels={{ close: t('common.close'), cancel: t('common.cancel') }}
      submitLabel={t('market.avatar.apply')}
      submitDisabled={bot === undefined}
      busy={busy}
      onCancel={onClose}
      onSubmit={() => void submit()}
      error={
        writeError === undefined
          ? undefined
          : t('market.avatar.applyFailed', {
              error: marketplaceError(writeError, t),
            })
      }
    >
      <div ref={mount}>
        {readError !== undefined ? (
          <ReadFailure
            retryLabel={t('market.retry')}
            onRetry={() => {
              setReadError(undefined);
              setReload((value) => value + 1);
            }}
          >
            {t('market.error.load', { error: marketplaceError(readError, t) })}
          </ReadFailure>
        ) : bots === undefined ? (
          <Note>{t('market.loading')}</Note>
        ) : (
          <BotChoiceList
            bots={bots}
            selected={selected}
            onSelect={select}
            label={t('market.avatar.applyTitle')}
            empty={<Note>{t('market.avatar.applyEmpty')}</Note>}
            disabled={busy}
            t={t}
            optionMarker="data-market-avatar-apply-option"
          />
        )}
      </div>
      {bot?.hasAppearance && <Note tone="warning">{t('market.avatar.applyWarning')}</Note>}
    </FormDialog>
  );
}
