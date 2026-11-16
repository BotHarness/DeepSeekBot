import { useMemo, useState, type ReactElement } from 'react';

import {
  IconChevronLeftOutlineRegular,
  IconChevronRightOutlineRegular,
  Tag,
} from '@deepseek-ai/dsh-client-ui-primitives';

import type { MarketplaceFile } from '../../../core/src/marketplace/client.js';
import type { BridgeActions } from './actions.js';
import { errorMessage, type BotSkillRow, type SkillDetailView } from './bridge.js';
import { ActionButton, ActionGroup } from './ds/action-button.js';
import { IconButton } from './ds/icon-button.js';
import { Note } from './ds/note.js';
import { ReadFailure } from './ds/read-failure.js';
import type { BotHarnessTranslate } from './locale.js';
import { MarketplaceFileReader, markdownBody } from './market-files.js';
import { MarkdownDocument, MarkdownImageLabel } from './memory-markdown-view.js';
import { useMountedResource } from './mounted-resource.js';

export interface BotSkillsSource {
  list(): Promise<BotSkillRow[]>;
  read(name: string): Promise<SkillDetailView>;
  remove(name: string): Promise<void>;
  subscribe?(listener: () => void): () => void;
}

function SkillRows({
  skills,
  t,
  onOpen,
}: {
  skills: readonly { name: string; description: string; userInvocable?: boolean }[];
  t: BotHarnessTranslate;
  onOpen(name: string): void;
}): ReactElement {
  return (
    <ul className="bh-skill-list">
      {skills.map((skill) => (
        <li key={skill.name}>
          <button
            type="button"
            className="bh-skill-row"
            data-skill-row={skill.name}
            onClick={() => onOpen(skill.name)}
          >
            <span className="bh-skill-row-name">/{skill.name}</span>
            {skill.userInvocable === false ? (
              <Tag tone="outline">{t('skills.modelOnly')}</Tag>
            ) : null}
            <span className="bh-skill-row-description" title={skill.description}>
              {skill.description}
            </span>
            <span className="bh-skill-row-chevron" aria-hidden="true">
              <IconChevronRightOutlineRegular size={16} />
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

type ListState =
  | { status: 'loading' }
  | { status: 'error'; cause: unknown }
  | { status: 'ready'; skills: BotSkillRow[] };

type DetailState =
  | { status: 'loading' }
  | { status: 'error'; cause: unknown }
  | { status: 'ready'; skill: SkillDetailView };

function SkillDetail({
  source,
  name,
  botName,
  t,
  onBack,
  onRemoved,
}: {
  source: BotSkillsSource;
  name: string;
  botName: string;
  t: BotHarnessTranslate;
  onBack(): void;
  onRemoved(): void;
}): ReactElement {
  const [state, setState] = useState<DetailState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | undefined>(undefined);
  const section = useMountedResource<HTMLElement>(
    (node) => {
      node.scrollIntoView?.({ block: 'nearest' });
      let live = true;
      setState({ status: 'loading' });
      void source.read(name).then(
        (skill) => {
          if (live) setState({ status: 'ready', skill });
        },
        (cause: unknown) => {
          if (live) setState({ status: 'error', cause });
        },
      );
      return () => {
        live = false;
      };
    },
    [source, name, attempt],
  );
  const remove = (): void => {
    setRemoving(true);
    setRemoveError(undefined);
    void source.remove(name).then(onRemoved, (cause: unknown) => {
      setRemoving(false);
      setRemoveError(t('skills.removeFailed', { name, error: errorMessage(cause) }));
    });
  };
  return (
    <section ref={section} className="bh-skill-detail" data-skill-detail={name}>
      <header className="bh-skill-detail-head">
        <IconButton aria-label={t('skills.back')} onClick={onBack}>
          <IconChevronLeftOutlineRegular size={16} />
        </IconButton>
        <strong className="bh-skill-row-name">/{name}</strong>
        {state.status === 'ready' && state.skill.path !== undefined ? (
          <span className="bh-skill-detail-path" title={state.skill.path}>
            {state.skill.path}
          </span>
        ) : null}
      </header>
      {state.status === 'loading' ? (
        <div className="bh-profile-empty" role="status">
          {t('market.detail.loading')}
        </div>
      ) : null}
      {state.status === 'error' ? (
        <ReadFailure retryLabel={t('skills.retry')} onRetry={() => setAttempt((n) => n + 1)}>
          {t('skills.loadFailed', { error: errorMessage(state.cause) })}
        </ReadFailure>
      ) : null}
      {state.status === 'ready' ? (
        <>
          {state.skill.description.length === 0 ? null : (
            <p className="bh-skill-detail-description">{state.skill.description}</p>
          )}
          <div className="bh-file-preview" data-skill-body>
            <MarkdownDocument
              body={markdownBody(state.skill.content)}
              image={(src, alt) => <MarkdownImageLabel key={src} src={src} alt={alt} />}
            />
          </div>
          {confirming ? (
            <div
              className="bh-skill-confirm"
              role="group"
              aria-label={t('skills.removeLabel', { name })}
            >
              <Note tone="warning">{t('skills.removeConfirm', { name, bot: botName })}</Note>
              <ActionGroup>
                <ActionButton icon="trash" tone="danger" busy={removing} onClick={remove}>
                  {t('skills.removeLabel', { name })}
                </ActionButton>
                <ActionButton
                  icon="x"
                  disabled={removing}
                  onClick={() => {
                    setConfirming(false);
                    setRemoveError(undefined);
                  }}
                >
                  {t('skills.cancel')}
                </ActionButton>
              </ActionGroup>
            </div>
          ) : (
            <ActionGroup>
              <ActionButton icon="trash" onClick={() => setConfirming(true)}>
                {t('skills.remove')}
              </ActionButton>
            </ActionGroup>
          )}
          {removeError === undefined ? null : <Note tone="danger">{removeError}</Note>}
        </>
      ) : null}
    </section>
  );
}

export function BotSkillsCard({
  source,
  botName,
  t,
}: {
  source: BotSkillsSource;
  botName: string;
  t: BotHarnessTranslate;
}): ReactElement {
  const [state, setState] = useState<ListState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [open, setOpen] = useState<string | undefined>(undefined);
  const root = useMountedResource<HTMLDivElement>(() => {
    let live = true;
    let generation = 0;
    const load = (): void => {
      const current = ++generation;
      void source.list().then(
        (skills) => {
          if (live && current === generation) setState({ status: 'ready', skills });
        },
        (cause: unknown) => {
          if (live && current === generation) setState({ status: 'error', cause });
        },
      );
    };
    const unsubscribe = source.subscribe?.(load);
    load();
    return () => {
      live = false;
      unsubscribe?.();
    };
  }, [source, attempt]);
  return (
    <div ref={root} className="bh-skills-card" data-bot-skills>
      {open !== undefined ? (
        <SkillDetail
          key={open}
          source={source}
          name={open}
          botName={botName}
          t={t}
          onBack={() => setOpen(undefined)}
          onRemoved={() => {
            setOpen(undefined);
            setAttempt((n) => n + 1);
          }}
        />
      ) : state.status === 'loading' ? (
        <div className="bh-profile-empty" role="status">
          {t('market.detail.loading')}
        </div>
      ) : state.status === 'error' ? (
        <ReadFailure retryLabel={t('skills.retry')} onRetry={() => setAttempt((n) => n + 1)}>
          {t('skills.loadFailed', { error: errorMessage(state.cause) })}
        </ReadFailure>
      ) : state.skills.length === 0 ? (
        <div className="bh-profile-empty">{t('skills.empty', { name: botName })}</div>
      ) : (
        <SkillRows skills={state.skills} t={t} onOpen={setOpen} />
      )}
    </div>
  );
}

export interface MarketplaceSkillFile {
  name: string;
  file: MarketplaceFile;
}

const SKILL_FILE = /^(\.dsh|\.agents)\/skills\/(?:([^/]+)\/SKILL\.md|([^/]+)\.md)$/u;

export function marketplaceSkillFiles(files: readonly MarketplaceFile[]): MarketplaceSkillFile[] {
  const found = new Map<string, MarketplaceSkillFile & { rank: number }>();
  for (const file of files) {
    const match = SKILL_FILE.exec(file.path);
    if (match === null) continue;
    const name = match[2] ?? match[3]!;
    const rank = match[1] === '.dsh' ? 0 : 1;
    const existing = found.get(name);
    if (existing === undefined || rank < existing.rank) found.set(name, { name, file, rank });
  }
  return [...found.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(({ name, file }) => ({ name, file }));
}

export function skillFrontmatterDescription(text: string): string {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/u.exec(text)?.[1];
  const line = frontmatter
    ?.split(/\r?\n/u)
    .find((entry) => /^description:\s*/u.test(entry))
    ?.replace(/^description:\s*/u, '')
    .trim();
  return line === undefined ? '' : line.replace(/^(['"])(.*)\1$/u, '$2');
}

export function MarketplaceSkills({
  actions,
  botId,
  files,
  t,
  describeError,
}: {
  actions: Pick<BridgeActions, 'marketplaceFile'>;
  botId: string;
  files: readonly MarketplaceFile[];
  t: BotHarnessTranslate;
  describeError: (cause: unknown) => string;
}): ReactElement | null {
  const skills = useMemo(() => marketplaceSkillFiles(files), [files]);
  const [descriptions, setDescriptions] = useState<ReadonlyMap<string, string>>(new Map());
  const [open, setOpen] = useState<MarketplaceSkillFile | undefined>(undefined);
  const [attempt, setAttempt] = useState(0);
  const root = useMountedResource<HTMLElement>(() => {
    let live = true;
    for (const skill of skills) {
      if (descriptions.has(skill.name)) continue;
      void actions.marketplaceFile(botId, skill.file.path).then(
        (view) => {
          if (!live) return;
          const description = skillFrontmatterDescription(view.text);
          setDescriptions((current) => new Map(current).set(skill.name, description));
        },
        () => undefined,
      );
    }
    return () => {
      live = false;
    };
  }, [actions, botId, skills, attempt]);
  if (skills.length === 0) return null;
  return (
    <section ref={root} className="bh-market-skills" data-market-skills={skills.length}>
      <header className="bh-market-files-head">
        <strong>{t('market.skills')}</strong>
      </header>
      {open === undefined ? (
        <SkillRows
          skills={skills.map((skill) => ({
            name: skill.name,
            description: descriptions.get(skill.name) ?? '',
          }))}
          t={t}
          onOpen={(name) => setOpen(skills.find((skill) => skill.name === name))}
        />
      ) : (
        <MarketplaceFileReader
          actions={actions}
          botId={botId}
          file={open.file}
          t={t}
          describeError={describeError}
          onBack={() => {
            setOpen(undefined);
            setAttempt((value) => value + 1);
          }}
        />
      )}
    </section>
  );
}
