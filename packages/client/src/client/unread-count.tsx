import type { ReactElement } from 'react';
import type { BotHarnessTranslate } from './locale.js';

export function unreadCountLabel(count: number): string {
  return count > 99 ? '99+' : String(count);
}

export function UnreadCount({
  count,
  muted = false,
  corner = false,
  t,
}: {
  count: number;
  muted?: boolean;
  corner?: boolean;
  t: BotHarnessTranslate;
}): ReactElement | null {
  if (count <= 0) return null;
  return (
    <span
      className={`bh-unread-count${corner ? ' bh-unread-corner' : ''}${muted ? ' bh-unread-count-muted' : ''}`}
      aria-label={t('roster.unreadCount', { count })}
    >
      {unreadCountLabel(count)}
    </span>
  );
}
