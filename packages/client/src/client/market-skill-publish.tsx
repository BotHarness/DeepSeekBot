import { createBrowserUuid } from '@botharness/host-protocol/browser-uuid';
import * as stylex from '@stylexjs/stylex';
import { useId, useRef, useState, type ReactElement } from 'react';
import type {
  MarketplaceSkill,
  MarketplaceSkillAddCandidate,
} from '@botharness/host-protocol/marketplace-skill';

import type { BridgeActions } from './actions.js';
import type { BotSkillRow } from './bridge.js';
import { Button } from './ds/button.js';
import { Callout } from './ds/callout.js';
import { Field, FieldStack } from './ds/field.js';
import { FormDialog } from './ds/form-dialog.js';
import { Note } from './ds/note.js';
import { PanelDialog } from './ds/panel-dialog.js';
import { ReadFailure } from './ds/read-failure.js';
import { Select } from './ds/select.js';
import { StepProgress } from './ds/step-progress.js';
import { Tag } from './ds/tag.js';
import { space } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import {
  MarketAuthorAccount,
  MarketAuthorFields,
  useMarketAuthorSession,
  type MarketAuthorActions,
} from './market-author-session.js';
import { FindingList, ScriptList } from './market-skill-dialog.js';
import type { MarketSkillActions } from './market-skills.js';
import { marketplaceError } from './marketplace-feedback.js';
import { useMountedResource } from './mounted-resource.js';

const styles = stylex.create({
  stack: { display: 'flex', flexDirection: 'column', gap: space.x3, minWidth: 0 },
  tags: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: space.x2 },
});

export type SkillPublishActions = MarketAuthorActions &
  Pick<BridgeActions, 'marketplaceSkillPublish'>;

export type SkillReplaceActions = Pick<
  BridgeActions,
  'marketplaceSkillReplace' | 'marketplaceSkillAddCandidates' | 'botSkills'
>;

export type SkillListingActions = SkillPublishActions &
  SkillReplaceActions &
  MarketSkillActions &
  Pick<BridgeActions, 'marketplaceSkillMine'>;

export function skillFilesLabel(count: number, t: BotHarnessTranslate): string {
  return count === 1 ? t('market.skills.filesOne') : t('market.skills.files', { count });
}

export function SkillAuthor({
  skill,
  t,
}: {
  skill: MarketplaceSkill;
  t: BotHarnessTranslate;
}): ReactElement | null {
  if (skill.upload === undefined) return null;
  const { name, id } = skill.upload.author;
  return (
    <span className="bh-market-owner" title={t('market.skills.author', { name, id })}>
      {name} #{id}
    </span>
  );
}

export function SkillScanResult({
  skill,
  t,
}: {
  skill: MarketplaceSkill;
  t: BotHarnessTranslate;
}): ReactElement {
  return (
    <div {...stylex.props(styles.stack)} data-market-skill-scan={skill.scan}>
      <div {...stylex.props(styles.tags)}>
        <SkillAuthor skill={skill} t={t} />
        {skill.scripts.length > 0 ? (
          <Tag tone="neutral">{t('market.skills.hasScripts')}</Tag>
        ) : null}
        <Tag tone="outline">{skillFilesLabel(skill.fileCount, t)}</Tag>
      </div>
      {skill.findings.length === 0 ? (
        <Note tone="success">{t('market.skills.cleanScan')}</Note>
      ) : (
        <Callout tone="warning" title={t('market.skills.warningTitle')} role="note">
          <FindingList findings={skill.findings} t={t} />
        </Callout>
      )}
      {skill.scripts.length === 0 ? null : (
        <Callout title={t('market.skills.scriptsTitle')} role="note">
          <ScriptList scripts={skill.scripts} />
        </Callout>
      )}
    </div>
  );
}

function SkillRejection({
  title,
  error,
  t,
}: {
  title: string;
  error: unknown;
  t: BotHarnessTranslate;
}): ReactElement {
  return (
    <Callout tone="danger" title={title} role="alert" data={{ 'data-market-skill-rejected': '' }}>
      {marketplaceError(error, t)}
    </Callout>
  );
}

function revisionKey(): string {
  return createBrowserUuid().replaceAll('-', '');
}

export function MarketSkillPublishDialog({
  actions,
  bot,
  name,
  t,
  onClose,
}: {
  actions: SkillPublishActions;
  bot: string;
  name: string;
  t: BotHarnessTranslate;
  onClose: () => void;
}): ReactElement {
  const formId = useId();
  const session = useMarketAuthorSession(actions);
  const { account, signedIn, readyAuthor, busy, error, run } = session;
  const [published, setPublished] = useState<MarketplaceSkill>();
  const requestKey = useRef<string>();
  const allowed = readyAuthor !== undefined || session.authorAllowed;

  const submit = () => {
    if (published !== undefined) {
      onClose();
      return;
    }
    if (account.kind !== 'ready' || !signedIn || !allowed) return;
    if (readyAuthor === undefined) {
      session.saveAuthor();
      return;
    }
    const key = (requestKey.current ??= revisionKey());
    void run(async () =>
      setPublished(
        await actions.marketplaceSkillPublish({
          bot,
          name,
          expectedAuthorId: readyAuthor.id,
          requestKey: key,
        }),
      ),
    );
  };
  const close = () => {
    if (!session.locked()) onClose();
  };
  const stage =
    published !== undefined ? 'done' : readyAuthor === undefined ? 'account' : 'details';

  return (
    <PanelDialog
      title={t('market.skills.publishTitle', { name })}
      size="small"
      closeLabel={t('common.close')}
      onClose={close}
      scroll
      bodyRef={session.mount}
      data={{ 'data-market-skill-publish': stage }}
      actions={
        signedIn ? (
          <Button
            variant="primary"
            type="submit"
            form={formId}
            disabled={busy || (stage !== 'done' && !allowed)}
          >
            {stage === 'done'
              ? t('market.skills.done')
              : stage === 'account'
                ? t('market.author.continue')
                : busy
                  ? t('market.skills.publishing')
                  : t('market.skills.publish')}
          </Button>
        ) : undefined
      }
    >
      {stage === 'done' ? null : (
        <StepProgress
          label={t('market.direct.progress')}
          steps={[t('market.direct.step.account'), t('market.direct.step.review')]}
          step={stage === 'account' ? 0 : 1}
          titles="current"
        />
      )}
      <MarketAuthorAccount session={session} t={t} />
      {signedIn && (
        <form
          id={formId}
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          {published !== undefined ? (
            <div {...stylex.props(styles.stack)}>
              <Note tone="success">{t('market.skills.published')}</Note>
              <SkillScanResult skill={published} t={t} />
            </div>
          ) : readyAuthor === undefined ? (
            <FieldStack>
              <MarketAuthorFields session={session} t={t} />
            </FieldStack>
          ) : (
            <div {...stylex.props(styles.stack)}>
              <span className="bh-market-owner">
                {t('market.skills.author', { name: readyAuthor.name, id: readyAuthor.id })}
              </span>
              <Note>{t('market.skills.publishScan')}</Note>
              <Note>{t('market.skills.publishPublic')}</Note>
            </div>
          )}
        </form>
      )}
      {error === undefined ? null : readyAuthor === undefined ? (
        <Note tone="danger">{marketplaceError(error, t)}</Note>
      ) : (
        <SkillRejection title={t('market.skills.rejectedTitle')} error={error} t={t} />
      )}
    </PanelDialog>
  );
}

type Sources =
  | { kind: 'loading' }
  | { kind: 'failed'; error: unknown }
  | { kind: 'ready'; bots: MarketplaceSkillAddCandidate[] };

type BotSkills =
  | { kind: 'loading' }
  | { kind: 'failed'; error: unknown }
  | { kind: 'ready'; skills: BotSkillRow[] };

export function MarketSkillReplaceDialog({
  actions,
  skill,
  from,
  t,
  onClose,
  onReplaced,
}: {
  actions: SkillReplaceActions;
  skill: MarketplaceSkill;
  from?: string | undefined;
  t: BotHarnessTranslate;
  onClose: () => void;
  onReplaced: (skill: MarketplaceSkill) => void;
}): ReactElement {
  const [sources, setSources] = useState<Sources>({ kind: 'loading' });
  const [bot, setBot] = useState<string>();
  const [skills, setSkills] = useState<BotSkills>({ kind: 'loading' });
  const [chosen, setChosen] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [replaced, setReplaced] = useState<MarketplaceSkill>();
  const lock = useRef(false);
  const mount = useMountedResource<HTMLDivElement>(() => {
    let live = true;
    void actions.marketplaceSkillAddCandidates().then(
      ({ bots }) => {
        if (!live) return;
        setSources({ kind: 'ready', bots });
        setBot(
          (current) =>
            current ?? bots.find((candidate) => candidate.slug === from)?.slug ?? bots[0]?.slug,
        );
      },
      (cause: unknown) => {
        if (live) setSources({ kind: 'failed', error: cause });
      },
    );
    return () => {
      live = false;
    };
  }, [actions, attempt]);
  const skillMount = useMountedResource<HTMLDivElement>(() => {
    const { botSkills } = actions;
    if (bot === undefined || botSkills === undefined) return undefined;
    let live = true;
    setSkills({ kind: 'loading' });
    void botSkills(bot).then(
      (rows) => {
        if (!live) return;
        setSkills({ kind: 'ready', skills: rows });
        setChosen(rows.find((row) => row.name === skill.name)?.name ?? rows[0]?.name);
      },
      (cause: unknown) => {
        if (live) setSkills({ kind: 'failed', error: cause });
      },
    );
    return () => {
      live = false;
    };
  }, [actions, bot, skill.name, attempt]);

  const ready =
    bot !== undefined &&
    chosen !== undefined &&
    skills.kind === 'ready' &&
    skills.skills.some((row) => row.name === chosen);
  const submit = async () => {
    if (replaced !== undefined) {
      onClose();
      return;
    }
    if (!ready || lock.current || skill.upload === undefined) return;
    lock.current = true;
    setBusy(true);
    setError(undefined);
    try {
      const next = await actions.marketplaceSkillReplace({
        id: skill.id,
        bot,
        name: chosen,
        expectedAuthorId: skill.upload.author.id,
      });
      setReplaced(next);
      onReplaced(next);
    } catch (cause) {
      setError(cause);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const retry = () => {
    setSources({ kind: 'loading' });
    setAttempt((value) => value + 1);
  };

  return (
    <FormDialog
      title={t('market.skills.mine.replaceTitle', { name: skill.name })}
      size="small"
      labels={{ close: t('common.close'), cancel: t('common.cancel') }}
      submitLabel={
        replaced !== undefined
          ? t('market.skills.done')
          : busy
            ? t('market.skills.publishing')
            : t('market.skills.mine.replace')
      }
      submitDisabled={replaced === undefined && !ready}
      submitData={{ 'data-market-skill-replace-submit': replaced === undefined ? 'pick' : 'done' }}
      showCancel={replaced === undefined}
      busy={busy}
      onCancel={() => {
        if (!lock.current) onClose();
      }}
      onSubmit={() => void submit()}
    >
      <div ref={mount} {...stylex.props(styles.stack)} data-market-skill-replace={skill.id}>
        {replaced !== undefined ? (
          <>
            <Note tone="success">{t('market.skills.replaced')}</Note>
            <SkillScanResult skill={replaced} t={t} />
          </>
        ) : sources.kind === 'loading' ? (
          <Note>{t('market.mine.loading')}</Note>
        ) : sources.kind === 'failed' ? (
          <ReadFailure retryLabel={t('market.retry')} onRetry={retry}>
            {marketplaceError(sources.error, t)}
          </ReadFailure>
        ) : sources.bots.length === 0 ? (
          <Note>{t('market.skills.mine.noBots')}</Note>
        ) : (
          <div ref={skillMount} {...stylex.props(styles.stack)}>
            <FieldStack>
              <Field label={t('market.skills.mine.bot')} group>
                {() => (
                  <Select
                    label={t('market.skills.mine.bot')}
                    value={bot ?? ''}
                    align="start"
                    disabled={busy}
                    options={sources.bots.map((candidate) => ({
                      value: candidate.slug,
                      label: candidate.displayName,
                    }))}
                    onChange={setBot}
                  />
                )}
              </Field>
              {skills.kind === 'loading' ? (
                <Note>{t('market.mine.loading')}</Note>
              ) : skills.kind === 'failed' ? (
                <ReadFailure retryLabel={t('market.retry')} onRetry={retry}>
                  {marketplaceError(skills.error, t)}
                </ReadFailure>
              ) : skills.skills.length === 0 ? (
                <Note>{t('market.skills.mine.noSkills')}</Note>
              ) : (
                <Field label={t('market.skills.mine.skill')} group>
                  {() => (
                    <Select
                      label={t('market.skills.mine.skill')}
                      value={chosen ?? ''}
                      align="start"
                      disabled={busy}
                      options={skills.skills.map((row) => ({
                        value: row.name,
                        label: `/${row.name}`,
                      }))}
                      onChange={setChosen}
                    />
                  )}
                </Field>
              )}
            </FieldStack>
            <Note tone="warning">
              {t('market.skills.mine.replaceConfirm', { name: skill.name })}
            </Note>
          </div>
        )}
        {error === undefined ? null : (
          <SkillRejection title={t('market.skills.replaceFailedTitle')} error={error} t={t} />
        )}
      </div>
    </FormDialog>
  );
}
