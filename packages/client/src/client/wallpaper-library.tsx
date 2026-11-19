import { useRef, useState, useSyncExternalStore, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { Appearance } from './appearance.js';
import { wallpaperMaterialPatches } from './appearance-materials.js';
import { Button } from './ds/button.js';
import { Icon } from './ds/icon.js';
import { IconButton } from './ds/icon-button.js';
import { HiddenFileInput } from './ds/input.js';
import {
  accent,
  ink,
  layer,
  radius,
  size as controlSize,
  space,
  style,
  type as text,
} from './ds/tobs.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import { DEFAULT_CROP, LIBRARY_LIMIT, WallpaperError } from './wallpaper-store.js';
import type { Wallpaper, WallpaperSnapshot } from './wallpaper.js';

const styles = stylex.create({
  strip: {
    display: 'flex',
    gap: space.x3,
    margin: 0,
    paddingBlock: space.x2,
    paddingInline: space.x1,
    listStyle: 'none',
    overflowX: 'auto',
    overflowY: 'hidden',
    scrollSnapType: 'x proximity',
    overscrollBehaviorX: 'contain',
  },
  cell: {
    position: 'relative',
    flexShrink: 0,
    scrollSnapAlign: 'start',
  },
  regular: { width: '136px' },
  large: { width: '176px' },
  thumb: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    pointerEvents: 'none',
  },
  badge: {
    position: 'absolute',
    insetInlineStart: space.x3,
    bottom: space.x3,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: style.iconSlot,
    height: style.iconSlot,
    borderRadius: radius.full,
    backgroundColor: accent.solid,
    color: accent.onSolid,
  },
  kind: {
    position: 'absolute',
    insetInlineEnd: space.x3,
    bottom: space.x3,
    paddingInline: space.x2,
    borderRadius: radius.xs,
    backgroundColor: layer.raised,
    color: ink.primary,
    fontSize: text.captionSize,
    lineHeight: text.captionLine,
  },
  actions: {
    position: 'absolute',
    top: space.x3,
    insetInlineEnd: space.x3,
    display: 'flex',
    gap: space.x2,
  },
  action: {
    width: controlSize.controlSmall,
    height: controlSize.controlSmall,
    borderRadius: style.radiusControl,
    backgroundColor: {
      default: layer.raised,
      ':hover': layer.well,
    },
  },
});

export interface WallpaperLibraryProps {
  readonly owner: Wallpaper;
  readonly t: BotHarnessTranslate;
  readonly appearance?: Appearance | undefined;
  readonly onChange?: ((snapshot: WallpaperSnapshot) => void) | undefined;
  readonly onAdjust?: ((id: string) => void) | undefined;
  readonly onError?: ((code: string | undefined) => void) | undefined;
  readonly size?: 'regular' | 'large';
}

export function WallpaperLibrary({
  owner,
  t,
  appearance,
  onChange,
  onAdjust,
  onError,
  size = 'regular',
}: WallpaperLibraryProps): ReactElement {
  const snapshot = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  const [busy, setBusy] = useState(false);
  const [dropping, setDropping] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const items = snapshot.library.items;
  const disabled = busy || !snapshot.ready;
  const run = async (action: () => Promise<unknown>) => {
    const hadWallpaper = owner.getSnapshot().current !== undefined;
    setBusy(true);
    onError?.(undefined);
    try {
      await action();
      if (!hadWallpaper && owner.getSnapshot().current && appearance) {
        for (const patch of wallpaperMaterialPatches(appearance.getSnapshot().config)) {
          try {
            appearance.update(patch);
          } catch {}
        }
      }
      onChange?.(owner.getSnapshot());
    } catch (error) {
      onError?.(error instanceof WallpaperError ? error.code : 'wallpaper-storage-unavailable');
    } finally {
      setBusy(false);
    }
  };
  const add = (files: readonly File[]) => {
    const media = files.filter((file) => /^(image|video)\//.test(file.type) || !file.type);
    if (!media.length) return;
    void run(async () => {
      for (const file of media) {
        if (owner.getSnapshot().library.items.length >= LIBRARY_LIMIT)
          throw new WallpaperError('wallpaper-library-full');
        await owner.add(file, DEFAULT_CROP, owner.getSnapshot().revision);
      }
    });
  };
  const sized = size === 'large' ? styles.large : styles.regular;
  const shownId = snapshot.current?.id;
  const strip = useMountedResource<HTMLUListElement>(
    (node) => {
      const tile = shownId
        ? [...node.querySelectorAll<HTMLElement>('[data-wallpaper-item]')].find(
            (li) => li.dataset.wallpaperItem === shownId,
          )
        : undefined;
      if (!tile) return;
      const box = node.getBoundingClientRect();
      const rect = tile.getBoundingClientRect();
      const offset =
        rect.left < box.left ? rect.left - box.left : Math.max(0, rect.right - box.right);
      if (offset) node.scrollBy?.({ left: offset, behavior: 'smooth' });
    },
    [shownId, items.length],
  );
  return (
    <ul
      ref={strip}
      aria-label={t('wallpaper.library')}
      data-wallpaper-library=""
      {...stylex.props(styles.strip)}
    >
      <li {...stylex.props(styles.cell, sized)}>
        <Button
          variant="preview"
          type="button"
          disabled={disabled || items.length >= LIBRARY_LIMIT}
          aria-label={t('wallpaper.upload')}
          onClick={() => input.current?.click()}
          onDragEnter={(event) => {
            event.preventDefault();
            setDropping(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
          }}
          onDragLeave={() => setDropping(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDropping(false);
            if (!disabled) add([...event.dataTransfer.files]);
          }}
          data-drag-over={dropping ? '' : undefined}
        >
          <Icon name="plus" />
          {t('wallpaper.add')}
        </Button>
        <HiddenFileInput
          ref={input}
          accept="image/*,video/*"
          multiple
          aria-label={t('wallpaper.upload')}
          disabled={disabled}
          onChange={(event) => {
            const files = [...(event.currentTarget.files ?? [])];
            event.currentTarget.value = '';
            add(files);
          }}
        />
      </li>
      <li {...stylex.props(styles.cell, sized)}>
        <Button
          variant="preview"
          type="button"
          aria-label={t('wallpaper.noneLabel')}
          aria-pressed={!snapshot.library.active}
          disabled={disabled}
          onClick={() => {
            if (snapshot.library.active) void run(() => owner.select(undefined, snapshot.revision));
          }}
        >
          <Icon name="ban" />
          {t('wallpaper.none')}
          {snapshot.library.active ? null : (
            <span {...stylex.props(styles.badge)}>
              <Icon name="check" size={12} />
            </span>
          )}
        </Button>
      </li>
      {items.map((item, index) => {
        const label = t('wallpaper.item', { n: index + 1 });
        const shown = snapshot.current?.id === item.id;
        return (
          <li key={item.id} data-wallpaper-item={item.id} {...stylex.props(styles.cell, sized)}>
            <Button
              variant="preview"
              type="button"
              aria-label={label}
              aria-pressed={shown}
              disabled={disabled}
              onClick={() => {
                if (!shown || snapshot.library.active !== item.id)
                  void run(() => owner.select(item.id, snapshot.revision));
              }}
            >
              <img src={item.thumbUrl} alt="" draggable={false} {...stylex.props(styles.thumb)} />
              {item.kind === 'video' ? (
                <span {...stylex.props(styles.kind)}>{t('wallpaper.video')}</span>
              ) : null}
              {shown ? (
                <span {...stylex.props(styles.badge)}>
                  <Icon name="check" size={12} />
                </span>
              ) : null}
            </Button>
            <div {...stylex.props(styles.actions)}>
              {onAdjust ? (
                <IconButton
                  type="button"
                  title={t('wallpaper.recrop')}
                  aria-label={`${t('wallpaper.recrop')} · ${label}`}
                  disabled={disabled}
                  onClick={() => onAdjust(item.id)}
                  xstyle={styles.action}
                >
                  <Icon name="crop" />
                </IconButton>
              ) : null}
              <IconButton
                type="button"
                title={t('wallpaper.remove')}
                aria-label={`${t('wallpaper.remove')} · ${label}`}
                disabled={disabled}
                onClick={() =>
                  void run(() => owner.remove(owner.getSnapshot().revision, Infinity, item.id))
                }
                xstyle={styles.action}
              >
                <Icon name="x" />
              </IconButton>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
