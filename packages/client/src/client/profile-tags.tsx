import * as stylex from '@stylexjs/stylex';
import { profileStyles } from './ds/profile-panel.js';
import { Tag } from './ds/tag.js';
import type { ReactElement } from 'react';

export function ProfileTags({ tags }: { tags: readonly string[] }): ReactElement | null {
  if (tags.length === 0) return null;
  return (
    <span {...stylex.props(profileStyles.tags)}>
      {tags.map((tag) => (
        <Tag key={tag} tone="neutral">
          {tag}
        </Tag>
      ))}
    </span>
  );
}
