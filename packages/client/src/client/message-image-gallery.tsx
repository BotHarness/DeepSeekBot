import {
  createContext,
  useContext,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import * as stylex from '@stylexjs/stylex';
import {
  IconChevronLeftOutlineRegular,
  IconChevronRightOutlineRegular,
  IconCloseOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives';

import { border, color, radius, space, text } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';

export interface GalleryImage {
  key: string;
  src: string;
  alt: string;
}

export function galleryImageKey(
  messageId: string,
  ref: { fileId?: string | undefined; hash?: string | undefined },
): string {
  return `${messageId}:${ref.fileId ?? ref.hash ?? ''}`;
}

export function galleryStep(length: number, index: number, delta: -1 | 1): number | undefined {
  const next = index + delta;
  return next < 0 || next >= length ? undefined : next;
}

const styles = stylex.create({
  backdrop: {
    position: 'fixed',
    inset: 0,
    zIndex: 1000,
    display: 'grid',
    placeItems: 'center',
    padding: space.x6,
  },
  mask: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'var(--dsw-alias-bg-mask-1)',
    backdropFilter: 'var(--dsw-mask-blur)',
  },
  image: {
    position: 'relative',
    maxWidth: 'min(100%, 1600px)',
    maxHeight: 'calc(100vh - 112px)',
    objectFit: 'contain',
    borderRadius: radius.lg,
    backgroundColor: 'var(--dsw-specific-input-major)',
    boxShadow: 'var(--dsw-elevation-prominent)',
  },
  control: {
    position: 'fixed',
    zIndex: 1,
    display: 'grid',
    placeItems: 'center',
    width: '36px',
    height: '36px',
    padding: 0,
    borderWidth: border.hairline,
    borderStyle: 'solid',
    borderColor: color.border,
    borderRadius: radius.round,
    backgroundColor: 'var(--dsw-specific-input-major)',
    color: color.fg,
    cursor: 'pointer',
    outline: { default: 'none', ':focus-visible': `${border.focus} solid ${color.accent}` },
    outlineOffset: '3px',
  },
  close: { top: '20px', right: '20px' },
  previous: { left: '20px', top: 'calc(50% - 18px)' },
  next: { right: '20px', top: 'calc(50% - 18px)' },
  counter: {
    position: 'fixed',
    zIndex: 1,
    bottom: '20px',
    left: '50%',
    transform: 'translateX(-50%)',
    paddingBlock: space.x1,
    paddingInline: space.x3,
    borderRadius: radius.sm,
    backgroundColor: 'var(--dsw-specific-input-major)',
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    fontVariantNumeric: 'tabular-nums',
  },
});

export function ImageGalleryLightbox({
  images,
  index,
  onIndex,
  onClose,
  t,
}: {
  images: readonly GalleryImage[];
  index: number;
  onIndex(index: number): void;
  onClose(): void;
  t: BotHarnessTranslate;
}): ReactElement | null {
  const image = images[index];
  const step = useRef<(delta: -1 | 1) => void>(() => undefined);
  step.current = (delta) => {
    const next = galleryStep(images.length, index, delta);
    if (next !== undefined) onIndex(next);
  };
  const close = useRef(onClose);
  close.current = onClose;
  const mount = useMountedResource<HTMLDivElement>((dialog) => {
    const restore = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.querySelector<HTMLButtonElement>('[data-gallery-close]')?.focus();
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        event.preventDefault();
        close.current();
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        step.current(event.key === 'ArrowLeft' ? -1 : 1);
      } else if (event.key === 'Tab') {
        const controls = Array.from(
          dialog.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
        );
        if (controls.length === 0) return;
        event.preventDefault();
        const at = controls.indexOf(document.activeElement as HTMLButtonElement);
        const next = (at + (event.shiftKey ? -1 : 1) + controls.length) % controls.length;
        controls[next]?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      restore?.focus();
    };
  }, []);
  if (image === undefined) return null;
  const many = images.length > 1;
  return createPortal(
    <div
      ref={mount}
      role="dialog"
      data-bh-appearance-owned=""
      aria-modal="true"
      aria-label={t('message.image.preview', { name: image.alt })}
      {...stylex.props(styles.backdrop)}
    >
      <div aria-hidden="true" onMouseDown={onClose} {...stylex.props(styles.mask)} />
      <img src={image.src} alt={image.alt} {...stylex.props(styles.image)} />
      <button
        type="button"
        data-gallery-close=""
        aria-label={t('common.close')}
        onClick={onClose}
        {...stylex.props(styles.control, styles.close)}
      >
        <IconCloseOutlineRegular size={16} />
      </button>
      {many ? (
        <>
          <button
            type="button"
            aria-label={t('message.image.previous')}
            disabled={galleryStep(images.length, index, -1) === undefined}
            onClick={() => step.current(-1)}
            {...stylex.props(styles.control, styles.previous)}
          >
            <IconChevronLeftOutlineRegular size={16} />
          </button>
          <button
            type="button"
            aria-label={t('message.image.next')}
            disabled={galleryStep(images.length, index, 1) === undefined}
            onClick={() => step.current(1)}
            {...stylex.props(styles.control, styles.next)}
          >
            <IconChevronRightOutlineRegular size={16} />
          </button>
          <span aria-live="polite" {...stylex.props(styles.counter)}>
            {t('message.image.position', {
              index: String(index + 1),
              count: String(images.length),
            })}
          </span>
        </>
      ) : null}
    </div>,
    document.body,
  );
}

export interface Gallery {
  open(key: string, fallback: GalleryImage): void;
}

const GalleryContext = createContext<Gallery | undefined>(undefined);

export function useImageGallery(): Gallery | undefined {
  return useContext(GalleryContext);
}

export function useMessageImageGallery(
  images: readonly GalleryImage[],
  t: BotHarnessTranslate,
): { gallery: Gallery; lightbox: ReactElement | null } {
  const [viewing, setViewing] = useState<{ key: string; fallback: GalleryImage }>();
  const known = viewing === undefined ? -1 : images.findIndex((item) => item.key === viewing.key);
  const shown = viewing === undefined ? [] : known === -1 ? [viewing.fallback] : images;
  const gallery = useRef<Gallery>({ open: () => undefined });
  gallery.current.open = (key, fallback) => setViewing({ key, fallback });
  return {
    gallery: gallery.current,
    lightbox:
      viewing === undefined ? null : (
        <ImageGalleryLightbox
          images={shown}
          index={Math.max(known, 0)}
          onIndex={(next) => {
            const item = shown[next];
            if (item !== undefined) setViewing({ key: item.key, fallback: item });
          }}
          onClose={() => setViewing(undefined)}
          t={t}
        />
      ),
  };
}

export const ImageGalleryScope = GalleryContext.Provider;

export function SingleImageGallery({
  t,
  children,
}: {
  t: BotHarnessTranslate;
  children: (open: (image: GalleryImage) => void) => ReactNode;
}): ReactElement {
  const [image, setImage] = useState<GalleryImage>();
  return (
    <>
      {children(setImage)}
      {image === undefined ? null : (
        <ImageGalleryLightbox
          images={[image]}
          index={0}
          onIndex={() => undefined}
          onClose={() => setImage(undefined)}
          t={t}
        />
      )}
    </>
  );
}
