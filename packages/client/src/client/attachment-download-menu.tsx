import { useRef, useState, type KeyboardEvent, type MouseEvent, type ReactElement } from 'react';
import { IconDownloadOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import { PointerMenu } from './ds/pointer-menu.js';
import type { BotHarnessTranslate } from './locale.js';

type Request = { x: number; y: number; returnFocus: HTMLElement };

export function downloadFromUrl(url: string, name: string): void {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

export function useAttachmentDownloadMenu(
  download: (() => void) | undefined,
  t: BotHarnessTranslate,
): {
  available: boolean;
  open(event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>): void;
  onKey(event: KeyboardEvent<HTMLElement>): void;
  menu: ReactElement | null;
} {
  const [request, setRequest] = useState<Request>();
  const proxy = useRef<HTMLSpanElement>(null);
  const open = (event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>): void => {
    if (download === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    const anchor =
      event.target instanceof Element
        ? (event.target.closest<HTMLElement>('button, a') ?? event.currentTarget)
        : event.currentTarget;
    const rect = anchor.getBoundingClientRect();
    const pointer = 'clientX' in event && event.type === 'contextmenu';
    setRequest({
      x: pointer ? event.clientX : rect.left,
      y: pointer ? event.clientY : rect.bottom,
      returnFocus: anchor,
    });
  };
  const close = (): void => {
    request?.returnFocus.focus();
    setRequest(undefined);
  };
  return {
    available: download !== undefined,
    open,
    onKey: (event) => {
      if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) open(event);
    },
    menu:
      request === undefined || download === undefined ? null : (
        <span hidden>
          <PointerMenu
            point={request}
            dense
            autoFocus
            anchor={<span ref={proxy} aria-hidden="true" />}
            items={[
              {
                id: 'download',
                label: t('fileAction.download'),
                icon: <IconDownloadOutlineRegular size={16} />,
              },
            ]}
            onSelect={(id) => {
              if (id === 'download') download();
              close();
            }}
            onClose={close}
          />
        </span>
      ),
  };
}
