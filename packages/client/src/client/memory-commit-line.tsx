import type { ReactElement } from 'react';
import { PersonaBotAvatar } from './avatar.js';
import { GitCommitIcon } from './git-commit-icon.js';
import type { BotHarnessTranslate } from './locale.js';
import type { BotSummary, ChannelMessage } from './store.js';

type MemoryCommit = NonNullable<ChannelMessage['memoryCommit']>;

function pathLabel(path: string, fullPath: boolean): string {
  return fullPath ? path : (path.split('/').at(-1) ?? path);
}

function fileSummary(
  commit: MemoryCommit,
  t: BotHarnessTranslate,
  fullPath: boolean,
): string | undefined {
  const changed = (file: MemoryCommit['files'][number]): number =>
    (file.added ?? 0) + (file.deleted ?? 0);
  const main = commit.files.reduce<MemoryCommit['files'][number] | undefined>(
    (best, file) => (best === undefined || changed(file) > changed(best) ? file : best),
    undefined,
  );
  if (main === undefined) return undefined;
  const counts = [
    main.added === null || main.added === 0 ? undefined : `+${main.added}`,
    main.deleted === null || main.deleted === 0 ? undefined : `−${main.deleted}`,
  ]
    .filter((part) => part !== undefined)
    .join(' ');
  const more = commit.files.length - 1 + commit.moreFiles;
  return [
    counts.length === 0
      ? pathLabel(main.path, fullPath)
      : `${pathLabel(main.path, fullPath)} ${counts}`,
    more > 0
      ? t(more === 1 ? 'memoryCommit.moreFilesOne' : 'memoryCommit.moreFiles', { count: more })
      : undefined,
  ]
    .filter((part) => part !== undefined)
    .join(' · ');
}

export function MemoryCommitLine({
  messageId,
  commit,
  bots,
  action,
  compact = false,
  t,
  onOpen,
}: {
  messageId: string;
  commit: MemoryCommit;
  bots: readonly BotSummary[];
  action?: string | undefined;
  compact?: boolean;
  t: BotHarnessTranslate;
  onOpen(): void;
}): ReactElement {
  const bot = bots.find((candidate) => candidate.slug === commit.botSlug);
  const name = bot?.displayName ?? commit.botSlug;
  const files = fileSummary(commit, t, false);
  const detail = fileSummary(commit, t, true);
  return (
    <div className="bh-memory-commit-row">
      <button
        type="button"
        className="bh-memory-commit-line"
        data-message-id={messageId}
        data-memory-display={compact ? 'compact' : undefined}
        title={
          compact
            ? undefined
            : [t('memoryCommit.author', { name: commit.authorName, sha: commit.sha }), detail]
                .filter((part) => part !== undefined)
                .join('\n')
        }
        onClick={onOpen}
      >
        <GitCommitIcon size={14} />
        <span className="bh-bot-dm-action-bot">
          <span className="bh-bot-dm-action-avatar" aria-hidden="true">
            <PersonaBotAvatar
              t={t}
              personaBotId={commit.botSlug}
              name={name}
              src={bot?.avatar}
              appearance={bot?.appearance}
              avatarSeed={bot?.avatarSeed}
              size={16}
              indicator={false}
              still
            />
          </span>
          <span className="bh-bot-dm-action-name">{name}</span>
        </span>
        <span className="bh-memory-commit-action">{action ?? t('memoryCommit.updated')}</span>
        {compact ? null : (
          <>
            <span className="bh-memory-commit-subject">{commit.subject}</span>
            <code className="bh-memory-commit-sha">{commit.sha.slice(0, 7)}</code>
            {files === undefined ? null : <span className="bh-memory-commit-files">{files}</span>}
          </>
        )}
      </button>
    </div>
  );
}
