import { Icon } from './ds/icon.js';
import { Tag } from './ds/tag.js';
import type { ReactElement } from 'react';

import type { BotHarnessTranslate } from './locale.js';
import { NameInput } from './name-input.js';

export const MAX_BOT_TAGS = 8;
export const MAX_BOT_TAG_LENGTH = 32;
export const MAX_BOT_BIO_LENGTH = 160;

export function normalizeRoleBadges(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
}

export function tagsWithDraft(tags: readonly string[], draft: string): string[] {
  return normalizeRoleBadges([...tags, ...draft.split(/[,，]/u)]);
}

export function TagEditor({
  id,
  tags,
  draft,
  disabled,
  t,
  onTags,
  onDraft,
}: {
  id: string;
  tags: readonly string[];
  draft: string;
  disabled: boolean;
  t: BotHarnessTranslate;
  onTags(tags: string[]): void;
  onDraft(draft: string): void;
}): ReactElement {
  const commit = (): void => {
    onTags(tagsWithDraft(tags, draft));
    onDraft('');
  };
  return (
    <div className="bh-role-editor">
      {tags.length === 0 ? null : (
        <div className="bh-role-editor-badges" aria-label={t('bot.create.roles.list')}>
          {tags.map((tag) => (
            <span className="bh-role-edit-badge" key={tag}>
              <Tag tone="neutral">{tag}</Tag>
              <button
                type="button"
                aria-label={t('bot.create.roles.remove', { role: tag })}
                disabled={disabled}
                onClick={() => onTags(tags.filter((item) => item !== tag))}
              >
                <Icon name="x" size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      <NameInput
        id={id}
        value={draft}
        disabled={disabled}
        placeholder={t('bot.create.roles.placeholder')}
        onBlur={commit}
        onChange={(event) => onDraft(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === 'Enter' || event.key === ',' || event.key === '，') {
            event.preventDefault();
            commit();
          } else if (event.key === 'Backspace' && draft.length === 0) {
            onTags(tags.slice(0, -1));
          }
        }}
      />
    </div>
  );
}
