import { FormDialog } from './ds/form-dialog.js';
import { createContext, useContext, useState, type ReactElement } from 'react';
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

export function MessageImagePreview({
  blob,
  t,
  onClose,
}: {
  blob: Blob;
  t: BotHarnessTranslate;
  onClose(): void;
}): ReactElement {
  const [url, setUrl] = useState<string>();
  const mount = useMountedResource<HTMLDivElement>(() => {
    const value = URL.createObjectURL(blob);
    setUrl(value);
    return () => URL.revokeObjectURL(value);
  }, [blob]);
  return (
    <FormDialog
      title={t('selection.screenshot')}
      size="wide"
      scroll
      labels={{ close: t('common.close'), cancel: t('common.cancel') }}
      submitLabel={t('selection.saveImage')}
      submitDisabled={url === undefined}
      onCancel={onClose}
      onClose={onClose}
      onSubmit={() => {
        if (url === undefined) return;
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = 'messages.png';
        anchor.click();
      }}
    >
      <div ref={mount}>
        {url === undefined ? null : (
          <img
            src={url}
            alt={t('selection.screenshot')}
            style={{ width: '100%', height: 'auto' }}
          />
        )}
      </div>
    </FormDialog>
  );
}
