import { useState, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import {
  parseSkillOwnerKey,
  skillOwnerKey,
  type SkillCatalogEntry,
  type SkillOwner,
} from '../../../core/src/skills/entries.js';
import { errorMessage } from './bridge.js';
import { ReadFailure } from './ds/read-failure.js';
import type { BotHarnessTranslate } from './locale.js';
import { markdownBody } from './market-files.js';
import { MarkdownDocument, MarkdownImageLabel } from './memory-markdown-view.js';
import { Modal } from './modal.js';
import { useMountedResource } from './mounted-resource.js';

export interface SkillPeek {
  name: string;
  owner: string;
  description: string;
}

export interface SkillDocument {
  description: string;
  content: string;
}

export interface SkillOpen extends SkillPeek {
  load(): Promise<SkillDocument>;
}

interface SkillHover extends SkillPeek {
  anchor: DOMRect;
}

const SUMMARY_LIMIT = 280;
const MARGIN = 12;
const GAP = 8;
const WIDTH = 360;

export function skillOwnerLabel(
  owner: SkillOwner,
  bot: { displayName: string } | undefined,
  t: BotHarnessTranslate,
): string {
  return owner.kind === 'host'
    ? t('composer.skillHost')
    : owner.kind === 'workspace'
      ? owner.name
      : (bot?.displayName ?? owner.botSlug);
}

export function skillSummary(content: string): string {
  const paragraph =
    markdownBody(content)
      .split(/\n\s*\n/u)
      .filter((block) => !block.split('\n').every((line) => /^\s*(?:#|$)/u.test(line)))
      .map((block) =>
        block
          .split('\n')
          .map((line) => line.replace(/^\s*(?:#+|[-*>]|\d+\.)\s*/u, '').trim())
          .filter((line) => line.length > 0)
          .join(' '),
      )
      .find((block) => block.length > 0) ?? '';
  return paragraph.length > SUMMARY_LIMIT ? `${paragraph.slice(0, SUMMARY_LIMIT - 1)}…` : paragraph;
}

export function skillPeekPosition(
  anchor: Pick<DOMRect, 'left' | 'top' | 'bottom'>,
  viewport: { width: number; height: number },
): { left: number; width: number; top?: number; bottom?: number } {
  const width = Math.min(WIDTH, viewport.width - MARGIN * 2);
  const left = Math.max(MARGIN, Math.min(anchor.left, viewport.width - width - MARGIN));
  return anchor.top > viewport.height / 2
    ? { left, width, bottom: viewport.height - anchor.top + GAP }
    : { left, width, top: anchor.bottom + GAP };
}

export function chipSkill(
  target: EventTarget,
  options: readonly (SkillCatalogEntry & { bot?: { displayName: string } | undefined })[],
  t: BotHarnessTranslate,
): { element: HTMLElement; ownerKey: string; peek: SkillPeek } | undefined {
  if (!(target instanceof Element)) return undefined;
  const element = target.closest<HTMLElement>('[data-skill-owner]');
  const ownerKey = element?.dataset.skillOwner;
  const name = element?.dataset.mentionLabel;
  const parsed = ownerKey === undefined ? undefined : parseSkillOwnerKey(ownerKey);
  if (element === null || ownerKey === undefined || name === undefined || parsed === undefined)
    return undefined;
  const option = options.find(
    (entry) => entry.name === name && skillOwnerKey(entry.owner) === ownerKey,
  );
  return {
    element,
    ownerKey,
    peek: {
      name,
      owner: skillOwnerLabel(option?.owner ?? parsed, option?.bot, t),
      description: option?.description ?? '',
    },
  };
}

function SkillHoverCard({ hover }: { hover: SkillHover }): ReactElement {
  return createPortal(
    <div
      className="bh-skill-peek"
      role="tooltip"
      data-skill-peek={hover.name}
      style={skillPeekPosition(hover.anchor, {
        width: window.innerWidth,
        height: window.innerHeight,
      })}
    >
      <span className="bh-skill-peek-name">
        /{hover.name} · {hover.owner}
      </span>
      {hover.description.length === 0 ? null : <p>{hover.description}</p>}
    </div>,
    document.body,
  );
}

type Loaded =
  | { status: 'loading' }
  | { status: 'ready'; skill: SkillDocument }
  | { status: 'error'; cause: unknown };

function SkillPreviewModal({
  skill,
  onClose,
  t,
}: {
  skill: SkillOpen;
  onClose(): void;
  t: BotHarnessTranslate;
}): ReactElement {
  const [state, setState] = useState<Loaded>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const body = useMountedResource<HTMLDivElement>(() => {
    let live = true;
    setState({ status: 'loading' });
    void skill.load().then(
      (loaded) => {
        if (live) setState({ status: 'ready', skill: loaded });
      },
      (cause: unknown) => {
        if (live) setState({ status: 'error', cause });
      },
    );
    return () => {
      live = false;
    };
  }, [skill, attempt]);
  const description =
    state.status === 'ready' && state.skill.description.length > 0
      ? state.skill.description
      : skill.description;
  return (
    <Modal
      open
      onClose={onClose}
      title={`/${skill.name}`}
      description={skill.owner}
      closeLabel={t('common.close')}
      className="bh-skill-preview"
    >
      <div ref={body} className="bh-skill-detail" data-skill-preview={skill.name}>
        {description.length === 0 ? null : (
          <p className="bh-skill-detail-description">{description}</p>
        )}
        {state.status === 'loading' ? (
          <div className="bh-profile-empty" role="status">
            {t('composer.skillLoading')}
          </div>
        ) : state.status === 'error' ? (
          <ReadFailure retryLabel={t('skills.retry')} onRetry={() => setAttempt((n) => n + 1)}>
            {t('composer.skillLoadFailed', { name: skill.name, error: errorMessage(state.cause) })}
          </ReadFailure>
        ) : (
          <div className="bh-file-preview" data-skill-body>
            <MarkdownDocument
              body={markdownBody(state.skill.content)}
              image={(src, alt) => <MarkdownImageLabel key={src} src={src} alt={alt} />}
            />
          </div>
        )}
      </div>
    </Modal>
  );
}

export function useSkillPeek(t: BotHarnessTranslate): {
  show(peek: SkillPeek, anchor: Element): void;
  hide(): void;
  open(skill: SkillOpen): void;
  layer: ReactNode;
} {
  const [hover, setHover] = useState<SkillHover | undefined>(undefined);
  const [opened, setOpened] = useState<SkillOpen | undefined>(undefined);
  return {
    show: (peek, anchor) => setHover({ ...peek, anchor: anchor.getBoundingClientRect() }),
    hide: () => setHover(undefined),
    open: (skill) => {
      setHover(undefined);
      setOpened(skill);
    },
    layer: (
      <>
        {hover === undefined || opened !== undefined ? null : <SkillHoverCard hover={hover} />}
        {opened === undefined ? null : (
          <SkillPreviewModal skill={opened} onClose={() => setOpened(undefined)} t={t} />
        )}
      </>
    ),
  };
}
