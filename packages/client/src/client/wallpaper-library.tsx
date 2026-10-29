import { useRef, useState, useSyncExternalStore, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { Appearance } from './appearance.js';
import { wallpaperMaterialPatches } from './appearance-materials.js';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import { border, color, radius, space, text } from './ds/tokens.stylex.js';
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
  tile: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.x2,
    width: '100%',
    aspectRatio: '16 / 10',
    padding: 0,
    overflow: 'hidden',
    borderWidth: border.hairline,
    borderStyle: 'solid',
    borderColor: color.border,
    borderRadius: radius.md,
    backgroundColor: color.well,
    color: color.muted,
    fontFamily: 'inherit',
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    cursor: { default: 'pointer', ':disabled': 'default' },
    outline: { default: 'none', ':focus-visible': `${border.focus} solid ${color.accent}` },
    outlineOffset: '2px',
    transitionProperty: 'border-color, background-color, box-shadow',
    transitionDuration: '120ms',
  },
  add: {
    borderStyle: 'dashed',
    borderWidth: border.focus,
    borderColor: { default: color.borderStrong, ':hover': color.accent },
    backgroundColor: { default: 'transparent', ':hover': color.hover },
    color: { default: color.muted, ':hover': color.fg },
  },
  dropping: {
    borderColor: color.accent,
    backgroundColor: color.accentTint,
    color: color.accentText,
  },
  selected: {
    borderColor: color.accent,
    boxShadow: `0 0 0 1px ${color.accent}`,
  },
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
    width: '18px',
    height: '18px',
    borderRadius: radius.round,
    cornerShape: 'round',
    backgroundColor: color.accent,
    color: color.onAccent,
  },
  kind: {
    position: 'absolute',
    insetInlineEnd: space.x3,
    bottom: space.x3,
    paddingInline: space.x2,
    borderRadius: radius.xs,
    backgroundColor: color.elevated,
    color: color.fg,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
  },
  actions: {
    position: 'absolute',
    top: space.x3,
    insetInlineEnd: space.x3,
    display: 'flex',
    gap: space.x2,
    opacity: { default: 0, ':is(li:hover > *)': 1, ':focus-within': 1 },
    transitionProperty: 'opacity',
    transitionDuration: '120ms',
  },
  action: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '24px',
    height: '24px',
    padding: 0,
    borderWidth: 0,
    borderRadius: radius.sm,
    backgroundColor: color.elevated,
    color: { default: color.muted, ':hover': color.fg },
    cursor: 'pointer',
    outline: { default: 'none', ':focus-visible': `${border.focus} solid ${color.accent}` },
  },
  input: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    overflow: 'hidden',
    clipPath: 'inset(50%)',
    whiteSpace: 'nowrap',
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
        <button
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
          {...stylex.props(styles.tile, styles.add, dropping && styles.dropping)}
        >
          <ChannelSidebarIcon name="plus" size={18} />
          {t('wallpaper.add')}
        </button>
        <input
          ref={input}
          type="file"
          accept="image/*,video/*"
          multiple
          tabIndex={-1}
          aria-label={t('wallpaper.upload')}
          disabled={disabled}
          onChange={(event) => {
            const files = [...(event.currentTarget.files ?? [])];
            event.currentTarget.value = '';
            add(files);
          }}
          {...stylex.props(styles.input)}
        />
      </li>
      <li {...stylex.props(styles.cell, sized)}>
        <button
          type="button"
          aria-label={t('wallpaper.noneLabel')}
          aria-pressed={!snapshot.library.active}
          disabled={disabled}
          onClick={() => {
            if (snapshot.library.active) void run(() => owner.select(undefined, snapshot.revision));
          }}
          {...stylex.props(styles.tile, !snapshot.library.active && styles.selected)}
        >
          <ChannelSidebarIcon name="ban" size={18} />
          {t('wallpaper.none')}
        </button>
      </li>
      {items.map((item, index) => {
        const label = t('wallpaper.item', { n: index + 1 });
        const shown = snapshot.current?.id === item.id;
        return (
          <li key={item.id} data-wallpaper-item={item.id} {...stylex.props(styles.cell, sized)}>
            <button
              type="button"
              aria-label={label}
              aria-pressed={shown}
              disabled={disabled}
              onClick={() => {
                if (!shown || snapshot.library.active !== item.id)
                  void run(() => owner.select(item.id, snapshot.revision));
              }}
              {...stylex.props(styles.tile, shown && styles.selected)}
            >
              <img src={item.thumbUrl} alt="" draggable={false} {...stylex.props(styles.thumb)} />
              {item.kind === 'video' ? (
                <span {...stylex.props(styles.kind)}>{t('wallpaper.video')}</span>
              ) : null}
              {shown ? (
                <span {...stylex.props(styles.badge)}>
                  <ChannelSidebarIcon name="check" size={12} />
                </span>
              ) : null}
            </button>
            <div {...stylex.props(styles.actions)}>
              {onAdjust ? (
                <button
                  type="button"
                  title={t('wallpaper.recrop')}
                  aria-label={`${t('wallpaper.recrop')} · ${label}`}
                  disabled={disabled}
                  onClick={() => onAdjust(item.id)}
                  {...stylex.props(styles.action)}
                >
                  <ChannelSidebarIcon name="crop" size={14} />
                </button>
              ) : null}
              <button
                type="button"
                title={t('wallpaper.remove')}
                aria-label={`${t('wallpaper.remove')} · ${label}`}
                disabled={disabled}
                onClick={() =>
                  void run(() => owner.remove(owner.getSnapshot().revision, Infinity, item.id))
                }
                {...stylex.props(styles.action)}
              >
                <ChannelSidebarIcon name="x" size={14} />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
