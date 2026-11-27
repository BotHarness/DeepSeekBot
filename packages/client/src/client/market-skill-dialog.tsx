import * as stylex from '@stylexjs/stylex';
import { useRef, useState, type ReactElement } from 'react';
import type {
  MarketplaceSkill,
  MarketplaceSkillAddCandidates,
  MarketplaceSkillAddResult,
  MarketplaceSkillConflictChoice,
  MarketplaceSkillDetail,
  MarketplaceSkillFinding,
  MarketplaceSkillReview,
} from '@botharness/host-protocol/marketplace-skill';

import { Callout } from './ds/callout.js';
import { Checkbox } from './ds/checkbox.js';
import { FormDialog } from './ds/form-dialog.js';
import { GroupHeading } from './ds/group-heading.js';
import { Note } from './ds/note.js';
import { ReadFailure } from './ds/read-failure.js';
import { SegmentedControl } from './ds/segmented.js';
import { Tag } from './ds/tag.js';
import { font } from './ds/tobs.stylex.js';
import { color, radius, space, text } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import { markdownBody } from './market-files.js';
import type { MarketSkillActions } from './market-skills.js';
import { installsLabel, SkillLogo } from './market-skills.js';
import { marketplaceError } from './marketplace-feedback.js';
import {
  ReportActions,
  ReportButton,
  ReportPanel,
  useMarketplaceReport,
} from './marketplace-report.js';
import { proveHuman } from './marketplace.js';
import { SkillAuthor } from './market-skill-publish.js';
import { MarkdownDocument, MarkdownImageLabel } from './memory-markdown-view.js';
import { useMountedResource } from './mounted-resource.js';

const styles = stylex.create({
  stack: { display: 'flex', flexDirection: 'column', gap: space.x3, minWidth: 0 },
  head: { display: 'flex', alignItems: 'center', gap: space.x3, minWidth: 0 },
  source: {
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    overflowWrap: 'anywhere',
  },
  tags: { display: 'flex', flexWrap: 'wrap', gap: space.x2 },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x2,
    margin: 0,
    padding: 0,
    listStyle: 'none',
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    overflowWrap: 'anywhere',
  },
  path: { fontFamily: font.familyMono, color: color.fg },
  size: { color: color.subtle },
  body: {
    padding: space.x4,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
  },
});

type Step = 'detail' | 'add' | 'done';

function bytes(size: number): string {
  return size < 1024 ? `${size} B` : `${(size / 1024).toFixed(1)} KB`;
}

export function FindingList({
  findings,
  t,
}: {
  findings: readonly MarketplaceSkillFinding[];
  t: BotHarnessTranslate;
}): ReactElement {
  return (
    <ul {...stylex.props(styles.list)}>
      {findings.map((finding) => (
        <li key={`${finding.path}:${finding.line}:${finding.kind}`}>
          {t(`market.skills.finding.${finding.kind}`)}{' '}
          <span {...stylex.props(styles.path)}>
            {finding.path}:{finding.line}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function ScriptList({ scripts }: { scripts: readonly string[] }): ReactElement {
  return (
    <ul {...stylex.props(styles.list)} data-market-skill-scripts>
      {scripts.map((script) => (
        <li key={script} {...stylex.props(styles.path)}>
          {script}
        </li>
      ))}
    </ul>
  );
}

function SkillDetailBody({
  skill,
  detail,
  t,
}: {
  skill: MarketplaceSkill;
  detail: MarketplaceSkillDetail;
  t: BotHarnessTranslate;
}): ReactElement {
  return (
    <div {...stylex.props(styles.stack)} data-market-skill-detail={skill.name}>
      <div {...stylex.props(styles.head)}>
        <SkillLogo />
        <div {...stylex.props(styles.stack)}>
          <span>{skill.description}</span>
          {skill.upload === undefined ? (
            <a
              href={skill.htmlUrl}
              target="_blank"
              rel="noreferrer"
              {...stylex.props(styles.source)}
            >
              {skill.path === '' ? skill.fullName : `${skill.fullName} · ${skill.path}`}
            </a>
          ) : (
            <SkillAuthor skill={skill} t={t} />
          )}
        </div>
      </div>
      <div {...stylex.props(styles.tags)}>
        {skill.official ? <Tag tone="info">{t('market.skills.official')}</Tag> : null}
        {skill.scripts.length > 0 ? (
          <Tag tone="neutral">{t('market.skills.hasScripts')}</Tag>
        ) : null}
        <Tag tone="outline">{installsLabel(skill.installs, t)}</Tag>
        <Tag tone="outline">
          {skill.fileCount === 1
            ? t('market.skills.filesOne')
            : t('market.skills.files', { count: skill.fileCount })}
        </Tag>
      </div>
      {skill.findings.length === 0 ? null : (
        <Callout tone="warning" title={t('market.skills.warningTitle')} role="note">
          <FindingList findings={skill.findings} t={t} />
        </Callout>
      )}
      {skill.scripts.length === 0 ? null : (
        <Callout title={t('market.skills.scriptsTitle')} role="note">
          <ScriptList scripts={skill.scripts} />
        </Callout>
      )}
      <div {...stylex.props(styles.body)} data-skill-body>
        <MarkdownDocument
          body={markdownBody(detail.content)}
          image={(src, alt) => <MarkdownImageLabel key={src} src={src} alt={alt} />}
        />
      </div>
      <GroupHeading label={t('market.skills.fileList')} count={detail.files.length} quiet flush />
      <ul {...stylex.props(styles.list)}>
        {detail.files.map((file) => (
          <li key={file.path}>
            <span {...stylex.props(styles.path)}>{file.path}</span>{' '}
            <span {...stylex.props(styles.size)}>{bytes(file.size)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AddTargets({
  review,
  candidates,
  bots,
  global,
  onBots,
  onGlobal,
  disabled,
  t,
}: {
  review: MarketplaceSkillReview;
  candidates: MarketplaceSkillAddCandidates;
  bots: readonly string[];
  global: boolean;
  onBots(next: string[]): void;
  onGlobal(next: boolean): void;
  disabled: boolean;
  t: BotHarnessTranslate;
}): ReactElement {
  const taken = (slug: string) => review.conflicts.bots.includes(slug);
  return (
    <div {...stylex.props(styles.stack)} role="group" aria-label={t('market.skills.addTo')}>
      <GroupHeading
        label={t('market.skills.addTo')}
        count={candidates.bots.length + (candidates.global ? 1 : 0)}
        quiet
        flush
      />
      {candidates.global ? (
        <Checkbox
          checked={global}
          disabled={disabled}
          onChange={onGlobal}
          label={
            review.conflicts.global ? t('market.skills.globalTaken') : t('market.skills.global')
          }
        />
      ) : null}
      {candidates.bots.map((bot) => (
        <Checkbox
          key={bot.slug}
          checked={bots.includes(bot.slug)}
          disabled={disabled}
          onChange={(checked) =>
            onBots(checked ? [...bots, bot.slug] : bots.filter((slug) => slug !== bot.slug))
          }
          label={
            taken(bot.slug)
              ? t('market.skills.botTaken', { name: bot.displayName })
              : bot.displayName
          }
        />
      ))}
      {candidates.bots.length === 0 && !candidates.global ? (
        <Note>{t('market.skills.noTargets')}</Note>
      ) : null}
    </div>
  );
}

export function MarketSkillDialog({
  skill,
  actions,
  t,
  onClose,
  onAdded,
}: {
  skill: MarketplaceSkill;
  actions: MarketSkillActions;
  t: BotHarnessTranslate;
  onClose(): void;
  onAdded(): void;
}): ReactElement {
  const [step, setStep] = useState<Step>('detail');
  const [detail, setDetail] = useState<MarketplaceSkillDetail>();
  const [review, setReview] = useState<MarketplaceSkillReview>();
  const [candidates, setCandidates] = useState<MarketplaceSkillAddCandidates>();
  const [readError, setReadError] = useState<unknown>();
  const [writeError, setWriteError] = useState<unknown>();
  const [reload, setReload] = useState(0);
  const [bots, setBots] = useState<string[]>([]);
  const [global, setGlobal] = useState(false);
  const [choice, setChoice] = useState<MarketplaceSkillConflictChoice>('rename');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<MarketplaceSkillAddResult>();
  const submitting = useRef(false);
  const report = useMarketplaceReport(() => proveHuman(actions), actions.marketplaceSkillReport);
  const reportable = step === 'detail' && skill.upload !== undefined;
  const reporting = reportable && report.state.status === 'open';

  const mount = useMountedResource<HTMLDivElement>(() => {
    let live = true;
    const fail = (error: unknown) => {
      if (live) setReadError(error);
    };
    if (step === 'detail')
      void actions.marketplaceSkillDetail(skill.id).then((value) => {
        if (live) setDetail(value);
      }, fail);
    if (step === 'add')
      void Promise.all([
        actions.marketplaceSkillReview(skill.id),
        actions.marketplaceSkillAddCandidates(),
      ]).then(([nextReview, nextCandidates]) => {
        if (!live) return;
        setReview(nextReview);
        setCandidates(nextCandidates);
        if (nextCandidates.bots.length === 1 && !nextCandidates.global)
          setBots([nextCandidates.bots[0]!.slug]);
      }, fail);
    return () => {
      live = false;
    };
  }, [actions, skill.id, step, reload]);

  const conflicted =
    review !== undefined &&
    ((global && review.conflicts.global) ||
      bots.some((slug) => review.conflicts.bots.includes(slug)));
  const blocked = review?.verdict === 'blocked';

  const submit = async () => {
    if (step === 'detail') {
      setReadError(undefined);
      setStep('add');
      return;
    }
    if (step === 'done') {
      onClose();
      return;
    }
    if (review === undefined || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setWriteError(undefined);
    try {
      const added = await actions.marketplaceSkillAdd(
        skill.id,
        review.reviewId,
        { bots, global },
        conflicted ? choice : undefined,
      );
      setResult(added);
      setStep('done');
      onAdded();
    } catch (error) {
      setWriteError(error);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  const failure =
    readError === undefined ? null : (
      <ReadFailure
        retryLabel={t('market.retry')}
        onRetry={() => {
          setReadError(undefined);
          setReload((value) => value + 1);
        }}
      >
        {t('market.error.load', { error: marketplaceError(readError, t) })}
      </ReadFailure>
    );

  const targetName = (target: string) =>
    target === 'global'
      ? t('market.skills.globalShort')
      : (candidates?.bots.find((bot) => bot.slug === target)?.displayName ?? target);

  return (
    <FormDialog
      title={step === 'add' ? t('market.skills.addTitle', { name: skill.name }) : skill.name}
      size={step === 'detail' ? 'wide' : 'medium'}
      scroll
      labels={{ close: t('common.close'), cancel: t('common.cancel') }}
      submitLabel={
        step === 'detail'
          ? t('market.skills.addOpen')
          : step === 'add'
            ? t('market.skills.add')
            : t('common.close')
      }
      showCancel={step !== 'done' && !reporting}
      secondary={
        !reportable ? undefined : reporting ? (
          <ReportActions report={report} id={skill.id} t={t} />
        ) : (
          <ReportButton report={report} t={t} disabled={detail === undefined} />
        )
      }
      submitDisabled={
        step === 'add' && (review === undefined || blocked || (bots.length === 0 && !global))
      }
      submitData={{ 'data-market-skill-submit': step }}
      busy={busy}
      onCancel={onClose}
      onSubmit={reporting ? undefined : () => void submit()}
      error={
        writeError === undefined
          ? undefined
          : t('market.skills.addFailed', { error: marketplaceError(writeError, t) })
      }
    >
      <div ref={mount}>
        {failure ??
          (step === 'detail' ? (
            detail === undefined ? (
              <Note>{t('market.skills.loading')}</Note>
            ) : (
              <>
                <SkillDetailBody skill={skill} detail={detail} t={t} />
                {reportable ? <ReportPanel report={report} t={t} kind="skill" /> : null}
              </>
            )
          ) : step === 'add' ? (
            review === undefined || candidates === undefined ? (
              <Note>{t('market.skills.reviewing')}</Note>
            ) : (
              <div {...stylex.props(styles.stack)} data-market-skill-review={review.verdict}>
                {blocked ? (
                  <Callout tone="danger" title={t('market.skills.blockedTitle')} role="alert">
                    <FindingList findings={review.findings} t={t} />
                  </Callout>
                ) : review.findings.length > 0 ? (
                  <Callout tone="warning" title={t('market.skills.warningTitle')} role="note">
                    <FindingList findings={review.findings} t={t} />
                  </Callout>
                ) : null}
                {review.scripts.length === 0 ? null : (
                  <Callout title={t('market.skills.scriptsReview')} role="note">
                    <ScriptList scripts={review.scripts} />
                  </Callout>
                )}
                <AddTargets
                  review={review}
                  candidates={candidates}
                  bots={bots}
                  global={global}
                  onBots={setBots}
                  onGlobal={setGlobal}
                  disabled={busy || blocked}
                  t={t}
                />
                {conflicted ? (
                  <SegmentedControl<MarketplaceSkillConflictChoice>
                    id={`bh-market-skill-conflict-${skill.id}`}
                    label={t('market.skills.conflict')}
                    value={choice}
                    options={[
                      { value: 'rename', label: t('market.skills.rename') },
                      { value: 'replace', label: t('market.skills.replace') },
                    ]}
                    onChange={setChoice}
                  />
                ) : null}
              </div>
            )
          ) : (
            <Note tone="success">
              {t('market.skills.added', {
                name: result?.name ?? skill.name,
                targets: (result?.added ?? [])
                  .map((entry) =>
                    entry.name === result?.name
                      ? targetName(entry.target)
                      : `${targetName(entry.target)} (${entry.name})`,
                  )
                  .join(', '),
              })}
            </Note>
          ))}
      </div>
    </FormDialog>
  );
}
