import { useRef, useState, type ReactElement } from 'react';

import * as stylex from '@stylexjs/stylex';
import { FormDialog } from './ds/form-dialog.js';
import { SettingsRow } from './ds/settings-row.js';
import { Slider } from './ds/slider.js';
import { accent, edge, layer, space, style } from './ds/tobs.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';

const PREVIEW_SIZE = 280;
const OUTPUT_SIZE = 128;

const styles = stylex.create({
  frame: { display: 'grid', gap: space.x4 },
  viewport: {
    position: 'relative',
    width: `${PREVIEW_SIZE}px`,
    height: `${PREVIEW_SIZE}px`,
    maxWidth: '100%',
    overflow: 'hidden',
    borderRadius: style.radiusContainer,
    backgroundColor: layer.well,
    outline: { default: 'none', ':focus-visible': `${edge.focus} solid ${accent.focus}` },
    cursor: { default: 'grab', ':active': 'grabbing' },
    touchAction: 'none',
  },
  image: (width: number, height: number, x: number, y: number) => ({
    position: 'absolute',
    top: '50%',
    left: '50%',
    maxWidth: 'none',
    userSelect: 'none',
    pointerEvents: 'none',
    width: `${width}px`,
    height: `${height}px`,
    transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`,
  }),
});

export function GroupAvatarCropModal({
  file,
  title,
  t,
  onClose,
  onSave,
}: {
  file: File;
  title?: string;
  t: BotHarnessTranslate;
  onClose: () => void;
  onSave: (avatar: string) => Promise<boolean>;
}): ReactElement {
  const [source, setSource] = useState<string>();
  const [dimensions, setDimensions] = useState<{
    width: number;
    height: number;
  }>();
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const drag = useRef<{
    x: number;
    y: number;
    offsetX: number;
    offsetY: number;
  }>();
  const sourceMount = useMountedResource<HTMLDivElement>(() => {
    setSource(undefined);
    setDimensions(undefined);
    setError(false);
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5_000_000) {
      setError(true);
      return;
    }
    const url = URL.createObjectURL(file);
    setSource(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const base = dimensions
    ? Math.max(PREVIEW_SIZE / dimensions.width, PREVIEW_SIZE / dimensions.height)
    : 1;
  const renderWidth = dimensions ? dimensions.width * base * zoom : PREVIEW_SIZE;
  const renderHeight = dimensions ? dimensions.height * base * zoom : PREVIEW_SIZE;
  const boundX = Math.max(0, (renderWidth - PREVIEW_SIZE) / 2);
  const boundY = Math.max(0, (renderHeight - PREVIEW_SIZE) / 2);
  const clamp = (value: number, bound: number): number => Math.max(-bound, Math.min(bound, value));
  const move = (x: number, y: number): void => {
    setOffset({ x: clamp(x, boundX), y: clamp(y, boundY) });
  };
  const save = async (): Promise<void> => {
    if (!dimensions) return;
    setBusy(true);
    setError(false);
    try {
      const bitmap = await createImageBitmap(file);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = OUTPUT_SIZE;
        canvas.height = OUTPUT_SIZE;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('canvas unavailable');
        const scale = OUTPUT_SIZE / PREVIEW_SIZE;
        context.drawImage(
          bitmap,
          ((PREVIEW_SIZE - renderWidth) / 2 + offset.x) * scale,
          ((PREVIEW_SIZE - renderHeight) / 2 + offset.y) * scale,
          renderWidth * scale,
          renderHeight * scale,
        );
        const avatar = canvas.toDataURL('image/webp', 0.82);
        if (!avatar.startsWith('data:image/webp;base64,') || avatar.length > 131_072)
          throw new Error('avatar too large');
        if (await onSave(avatar)) onClose();
        else setError(true);
      } finally {
        bitmap.close();
      }
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <FormDialog
      title={title ?? t('group.avatarCrop.title')}
      description={t('group.avatarCrop.description')}
      labels={{ close: t('common.close'), cancel: t('common.cancel') }}
      submitLabel={t('group.avatarCrop.save')}
      submitDisabled={!dimensions || busy}
      error={error ? t('group.avatarCrop.error') : undefined}
      onCancel={onClose}
      onSubmit={() => void save()}
    >
      <div ref={sourceMount} {...stylex.props(styles.frame)}>
        <div
          data-group-avatar-crop-viewport=""
          {...stylex.props(styles.viewport)}
          role="img"
          tabIndex={0}
          aria-label={t('group.avatarCrop.move')}
          onPointerDown={(event) => {
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = {
              x: event.clientX,
              y: event.clientY,
              offsetX: offset.x,
              offsetY: offset.y,
            };
          }}
          onPointerMove={(event) => {
            if (!drag.current) return;
            move(
              drag.current.offsetX + event.clientX - drag.current.x,
              drag.current.offsetY + event.clientY - drag.current.y,
            );
          }}
          onPointerUp={() => {
            drag.current = undefined;
          }}
          onPointerCancel={() => {
            drag.current = undefined;
          }}
          onKeyDown={(event) => {
            const step = event.shiftKey ? 20 : 5;
            if (event.key === 'ArrowLeft') move(offset.x - step, offset.y);
            else if (event.key === 'ArrowRight') move(offset.x + step, offset.y);
            else if (event.key === 'ArrowUp') move(offset.x, offset.y - step);
            else if (event.key === 'ArrowDown') move(offset.x, offset.y + step);
            else return;
            event.preventDefault();
          }}
        >
          {source ? (
            <img
              src={source}
              alt=""
              draggable={false}
              {...stylex.props(styles.image(renderWidth, renderHeight, offset.x, offset.y))}
              onLoad={(event) =>
                setDimensions({
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight,
                })
              }
              onError={() => setError(true)}
            />
          ) : null}
        </div>
        <SettingsRow
          title={t('group.avatarCrop.zoom')}
          control={
            <Slider
              id="bh-group-avatar-zoom"
              label={t('group.avatarCrop.zoom')}
              min={1}
              max={3}
              step={0.05}
              value={zoom}
              onChange={(next) => {
                setZoom(next);
                if (!dimensions) return;
                const nextX = Math.max(0, (dimensions.width * base * next - PREVIEW_SIZE) / 2);
                const nextY = Math.max(0, (dimensions.height * base * next - PREVIEW_SIZE) / 2);
                setOffset({ x: clamp(offset.x, nextX), y: clamp(offset.y, nextY) });
              }}
            />
          }
        />
      </div>
    </FormDialog>
  );
}
