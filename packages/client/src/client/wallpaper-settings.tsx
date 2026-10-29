import { useRef, useState, useSyncExternalStore, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button, Switch } from '@deepseek-ai/dsh-client-ui-primitives';
import type { Appearance } from './appearance.js';
import { SettingsRow, SettingsSection } from './ds/settings-row.js';
import { Note } from './ds/note.js';
import { Select } from './ds/select.js';
import { color, radius, space, text } from './ds/tokens.stylex.js';
import { useMountedResource } from './mounted-resource.js';
import type { BotHarnessKey, BotHarnessTranslate } from './locale.js';
import { type Wallpaper, type WallpaperPreview } from './wallpaper.js';
import { WallpaperLibrary } from './wallpaper-library.js';
import { mountWallpaperPlayback } from './wallpaper-playback.js';
import { wallpaperPlacement, type WallpaperCrop } from './wallpaper-store.js';

const styles = stylex.create({
  editor: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x3,
    paddingTop: space.x3,
  },
  zoom: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x3,
    color: color.muted,
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
  },
  preview: { borderRadius: radius.md, cornerShape: 'round' },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: space.x3 },
});

const INTERVALS: readonly { value: string; label: BotHarnessKey }[] = [
  { value: '0', label: 'wallpaper.interval.off' },
  { value: '60000', label: 'wallpaper.interval.1m' },
  { value: '300000', label: 'wallpaper.interval.5m' },
  { value: '900000', label: 'wallpaper.interval.15m' },
  { value: '1800000', label: 'wallpaper.interval.30m' },
  { value: '3600000', label: 'wallpaper.interval.1h' },
];

const REASONS: Record<string, BotHarnessKey> = {
  'wallpaper-autoplay-blocked': 'wallpaper.reason.blocked',
  'wallpaper-video-playback-blocked': 'wallpaper.reason.blocked',
  'wallpaper-playback-stalled': 'wallpaper.reason.stalled',
  'wallpaper-playback-interrupted': 'wallpaper.reason.interrupted',
};

export function WallpaperSettings({
  owner,
  appearance,
  t,
}: {
  owner: Wallpaper;
  appearance?: Appearance | undefined;
  t: BotHarnessTranslate;
}): ReactElement {
  const snapshot = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  const [error, setError] = useState<string>();
  const [editing, setEditing] = useState<string>();
  const { library } = snapshot;
  const change = (action: () => Promise<unknown>) => {
    setError(undefined);
    void action().catch((e: unknown) =>
      setError(e instanceof Error ? e.message : 'wallpaper-storage-unavailable'),
    );
  };
  return (
    <SettingsSection title={t('wallpaper.title')} description={t('wallpaper.local')}>
      <WallpaperLibrary
        owner={owner}
        t={t}
        appearance={appearance}
        onAdjust={setEditing}
        onError={setError}
        onChange={() => setEditing(undefined)}
      />
      {error || snapshot.error ? (
        <Note tone="danger">
          {t(error === 'wallpaper-library-full' ? 'wallpaper.full' : 'wallpaper.failed')}
        </Note>
      ) : null}
      {snapshot.playback && (
        <Note>
          {t('wallpaper.status')}: {t(`wallpaper.state.${snapshot.playback.state}`)}
          {snapshot.playback.reason
            ? ` · ${t(REASONS[snapshot.playback.reason] ?? 'wallpaper.reason.decode')}`
            : ''}
        </Note>
      )}
      {editing && library.items.some((item) => item.id === editing) ? (
        <WallpaperCropEditor
          key={`${editing}:${snapshot.resourceVersion}`}
          owner={owner}
          id={editing}
          t={t}
          onDone={() => setEditing(undefined)}
          onError={setError}
        />
      ) : null}
      {library.items.length > 1 ? (
        <>
          <SettingsRow
            title={t('wallpaper.interval')}
            control={
              <Select
                label={t('wallpaper.interval')}
                value={String(library.interval)}
                options={INTERVALS.map((option) => ({
                  value: option.value,
                  label: t(option.label),
                }))}
                onChange={(value) =>
                  change(() => owner.setRotation({ interval: Number(value) }, snapshot.revision))
                }
              />
            }
          />
          <SettingsRow
            title={t('wallpaper.shuffle')}
            control={
              <Switch
                checked={library.shuffle}
                disabled={library.interval === 0}
                label={t('wallpaper.shuffle')}
                onChange={(shuffle: boolean) =>
                  change(() => owner.setRotation({ shuffle }, snapshot.revision))
                }
              />
            }
          />
        </>
      ) : null}
    </SettingsSection>
  );
}

function WallpaperCropEditor({
  owner,
  id,
  t,
  onDone,
  onError,
}: {
  owner: Wallpaper;
  id: string;
  t: BotHarnessTranslate;
  onDone: () => void;
  onError: (code: string | undefined) => void;
}): ReactElement | null {
  const [preview, setPreview] = useState<WallpaperPreview>();
  const [crop, setCrop] = useState<WallpaperCrop>();
  const [busy, setBusy] = useState(false);
  const live = useRef(false);
  const drag = useRef<{ x: number; y: number; crop: WallpaperCrop }>();
  const mount = useMountedResource<HTMLDivElement>(() => {
    live.current = true;
    let resource: WallpaperPreview | undefined;
    void owner
      .previewCurrent(id)
      .then((next) => {
        if (!live.current) return next.release();
        resource = next;
        setPreview(next);
        setCrop(owner.describe().library.items.find((item) => item.id === id)?.crop);
      })
      .catch(() => {
        if (live.current) onError('wallpaper-decode-failed');
      });
    return () => {
      live.current = false;
      resource?.release();
    };
  }, [owner, id]);
  const previewMount = useMountedResource<HTMLDivElement>(
    (node) => {
      const image = node.querySelector<HTMLElement>('img,video')!;
      const paint = () => {
        if (!preview || !crop) return;
        const box = node.getBoundingClientRect();
        const placement = wallpaperPlacement(
          preview.width,
          preview.height,
          box.width,
          box.height,
          crop,
        );
        for (const [key, value] of Object.entries(placement))
          image.style.setProperty(key, `${value}px`);
      };
      const resize = new ResizeObserver(paint);
      resize.observe(node);
      paint();
      return () => resize.disconnect();
    },
    [preview, crop],
  );
  const videoMount = useMountedResource<HTMLVideoElement>(
    (node) => {
      if (!preview) return;
      node.src = preview.url;
      return mountWallpaperPlayback(
        node,
        () => {},
        () => true,
      );
    },
    [preview],
  );
  return (
    <div ref={mount} data-wallpaper-editor="" {...stylex.props(styles.editor)}>
      {preview && crop ? (
        <>
          <Note>{t('wallpaper.cropHelp')}</Note>
          <div
            ref={previewMount}
            data-wallpaper-preview=""
            role="img"
            aria-label={t('wallpaper.preview')}
            style={{
              position: 'relative',
              width: '100%',
              aspectRatio:
                typeof window === 'undefined'
                  ? '1.6'
                  : String(window.innerWidth / window.innerHeight),
              overflow: 'hidden',
              touchAction: 'none',
              cursor: 'move',
            }}
            onPointerDown={(event) => {
              if (event.button !== 0 || busy) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = { x: event.clientX, y: event.clientY, crop };
            }}
            onPointerMove={(event) => {
              if (!drag.current || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
              const box = event.currentTarget.getBoundingClientRect();
              const size = wallpaperPlacement(
                preview.width,
                preview.height,
                box.width,
                box.height,
                drag.current.crop,
              );
              setCrop({
                ...crop,
                x: Math.max(
                  0,
                  Math.min(1, drag.current.crop.x - (event.clientX - drag.current.x) / size.width),
                ),
                y: Math.max(
                  0,
                  Math.min(1, drag.current.crop.y - (event.clientY - drag.current.y) / size.height),
                ),
              });
            }}
            onPointerUp={() => {
              drag.current = undefined;
            }}
            onLostPointerCapture={() => {
              drag.current = undefined;
            }}
          >
            {preview.kind === 'video' ? (
              <video
                ref={videoMount}
                poster={preview.posterUrl}
                muted
                loop
                playsInline
                controls={false}
                aria-hidden="true"
                tabIndex={-1}
                style={{
                  position: 'absolute',
                  maxWidth: 'none',
                  maxHeight: 'none',
                  pointerEvents: 'none',
                }}
              />
            ) : (
              <img
                src={preview.url}
                alt=""
                draggable={false}
                style={{
                  position: 'absolute',
                  maxWidth: 'none',
                  maxHeight: 'none',
                  pointerEvents: 'none',
                }}
              />
            )}
          </div>
          <label {...stylex.props(styles.zoom)}>
            {t('wallpaper.zoom')}
            <input
              aria-label={t('wallpaper.zoom')}
              type="range"
              min="1"
              max="5"
              step="0.05"
              value={crop.zoom}
              disabled={busy}
              onChange={(e) => setCrop({ ...crop, zoom: Number(e.currentTarget.value) })}
            />
          </label>
          <div {...stylex.props(styles.actions)}>
            <Button variant="outline" disabled={busy} onClick={onDone}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                onError(undefined);
                void owner
                  .crop(crop, owner.getSnapshot().revision, Infinity, id)
                  .then(() => {
                    if (live.current) onDone();
                  })
                  .catch((e: unknown) => {
                    if (live.current)
                      onError(e instanceof Error ? e.message : 'wallpaper-storage-unavailable');
                  })
                  .finally(() => {
                    if (live.current) setBusy(false);
                  });
              }}
            >
              {t('wallpaper.use')}
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
