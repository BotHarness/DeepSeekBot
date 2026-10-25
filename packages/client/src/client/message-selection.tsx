import { createContext, useContext, type ReactElement } from 'react';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';

import type { MessageSelection } from './message-selection-state.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';

export const MessageSelectionContext = createContext<MessageSelection | undefined>(undefined);

export function useMessageSelection(): MessageSelection | undefined {
  return useContext(MessageSelectionContext);
}

export type MessageSelectionExport = 'image' | 'conversation';

export function MessageSelectionBar({
  count,
  busy,
  notice,
  onExport,
  onCancel,
  t,
}: {
  count: number;
  busy: boolean;
  notice?: string | undefined;
  onExport(kind: MessageSelectionExport): void;
  onCancel(): void;
  t: BotHarnessTranslate;
}): ReactElement {
  const mount = useMountedResource<HTMLDivElement>(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !event.defaultPrevented) onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);
  return (
    <div
      ref={mount}
      className="bh-selection-bar"
      role="toolbar"
      aria-label={t('selection.toolbar')}
      data-message-selection
    >
      <span className="bh-selection-count" role="status">
        {notice ??
          (count === 0 ? t('selection.hint') : t('selection.count', { count: String(count) }))}
      </span>
      <div className="bh-selection-actions">
        <Button variant="outline" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button
          variant="outline"
          disabled={count === 0 || busy}
          onClick={() => onExport('conversation')}
        >
          {t('selection.copy')}
        </Button>
        <Button variant="primary" disabled={count === 0 || busy} onClick={() => onExport('image')}>
          {t('selection.screenshot')}
        </Button>
      </div>
    </div>
  );
}
