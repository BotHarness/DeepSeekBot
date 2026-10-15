import type { ReactElement } from 'react';
import { PersonaBotAvatar } from './avatar.js';
import type { BotHarnessTranslate } from './locale.js';
import { ProfileTags } from './profile-tags.js';
import type { BotCreatePreview } from './store.js';

const PREVIEW_LINES = 3;

export interface BotCreateArgs {
  displayName: string;
  description?: string;
  tags: string[];
  avatarPath?: string;
  soul?: string;
  coreMemory?: string;
  memoryLocation?: string;
}

const optional = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value : undefined;

export function botCreateArgs(input: string): BotCreateArgs | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    return undefined;
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined;
  const args = parsed as Record<string, unknown>;
  const displayName = optional(args['display_name']);
  if (displayName === undefined) return undefined;
  const description = optional(args['description']);
  const avatarPath = optional(args['avatar_path']);
  const soul = optional(args['soul']);
  const coreMemory = optional(args['core_memory']);
  const memoryLocation = optional(args['memory_location']);
  return {
    displayName: displayName.trim(),
    tags: Array.isArray(args['tags'])
      ? [
          ...new Set(
            args['tags']
              .filter((tag): tag is string => typeof tag === 'string')
              .map((tag) => tag.trim())
              .filter((tag) => tag.length > 0),
          ),
        ]
      : [],
    ...(description === undefined ? {} : { description: description.trim() }),
    ...(avatarPath === undefined ? {} : { avatarPath }),
    ...(soul === undefined ? {} : { soul }),
    ...(coreMemory === undefined ? {} : { coreMemory }),
    ...(memoryLocation === undefined ? {} : { memoryLocation }),
  };
}

function firstLines(text: string): { text: string; more: boolean } {
  const lines = text.trim().split('\n');
  return { text: lines.slice(0, PREVIEW_LINES).join('\n'), more: lines.length > PREVIEW_LINES };
}

function FilePreview({
  label,
  text,
  fallback,
  t,
}: {
  label: string;
  text: string | undefined;
  fallback: string;
  t: BotHarnessTranslate;
}): ReactElement {
  const shown = text === undefined ? undefined : firstLines(text);
  return (
    <div className="bh-bot-create-file">
      <span className="bh-bot-create-label">{label}</span>
      {shown === undefined ? (
        <span className="bh-bot-create-fallback">{fallback}</span>
      ) : (
        <pre className="bh-bot-create-excerpt">
          {shown.text}
          {shown.more ? '\n' + t('approval.botCreate.more') : ''}
        </pre>
      )}
    </div>
  );
}

export function BotCreateApprovalPreview({
  args,
  preview,
  t,
}: {
  args: BotCreateArgs;
  preview: BotCreatePreview | undefined;
  t: BotHarnessTranslate;
}): ReactElement {
  const memoryFolder =
    preview?.memoryFolder ??
    (args.memoryLocation === undefined
      ? undefined
      : args.memoryLocation.replace(/[\\/]+$/u, '') + '/<new-bot-id>');
  return (
    <div className="bh-bot-create-preview">
      <div className="bh-bot-create-identity">
        <PersonaBotAvatar
          t={t}
          personaBotId="new-bot"
          name={args.displayName}
          src={preview?.avatar}
          avatarSeed={2}
          size={40}
          indicator={false}
          still
        />
        <div className="bh-bot-create-names">
          <span className="bh-bot-create-name">{args.displayName}</span>
          {args.description === undefined ? null : (
            <span className="bh-bot-create-bio">{args.description}</span>
          )}
        </div>
      </div>
      <ProfileTags tags={args.tags} />
      {args.avatarPath === undefined ? null : (
        <div className="bh-bot-create-file">
          <span className="bh-bot-create-label">{t('approval.botCreate.avatar')}</span>
          <code className="bh-bot-create-path">{args.avatarPath}</code>
          {preview?.avatarError === undefined ? null : (
            <span className="bh-bot-create-warning">{preview.avatarError}</span>
          )}
        </div>
      )}
      <FilePreview
        label="SOUL.md"
        text={args.soul}
        fallback={t('approval.botCreate.noSoul')}
        t={t}
      />
      <FilePreview
        label="MEMORY.md"
        text={args.coreMemory}
        fallback={t('approval.botCreate.coreMemoryTemplate')}
        t={t}
      />
      <div className="bh-bot-create-file">
        <span className="bh-bot-create-label">{t('approval.botCreate.memoryFolder')}</span>
        {memoryFolder === undefined ? (
          <span className="bh-bot-create-fallback">{t('approval.botCreate.defaultLocation')}</span>
        ) : (
          <code className="bh-bot-create-path">{memoryFolder}</code>
        )}
        {preview?.defaultLocation === true ? (
          <span className="bh-bot-create-fallback">{t('approval.botCreate.defaultLocation')}</span>
        ) : null}
      </div>
    </div>
  );
}
