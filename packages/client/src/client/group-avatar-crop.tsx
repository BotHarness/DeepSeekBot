import { useRef, useState, type ReactElement } from 'react';

import {
  AVATAR_OUTPUT_SIZE,
  AVATAR_SOURCE_BYTES,
  GROUP_AVATAR_BYTES,
  encodeAvatar,
} from './avatar-encoding.js';
import { FormDialog } from './ds/form-dialog.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';

const PREVIEW_SIZE = 280;
const OUTPUT_SIZE = AVATAR_OUTPUT_SIZE;

export function GroupAvatarCropModal({
  file,
  t,
  onClose,
  onSave,
}: {
  file: File;
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
    if (
      !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
      file.size > AVATAR_SOURCE_BYTES
    ) {
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
        const avatar = encodeAvatar(canvas, GROUP_AVATAR_BYTES);
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
      title={t('group.avatarCrop.title')}
      description={t('group.avatarCrop.description')}
      labels={{ close: t('common.close'), cancel: t('common.cancel') }}
      submitLabel={t('group.avatarCrop.save')}
      submitDisabled={!dimensions || busy}
      error={error ? t('group.avatarCrop.error') : undefined}
      onCancel={onClose}
      onSubmit={() => void save()}
    >
      <div className="bh-group-avatar-crop" ref={sourceMount}>
        <div
          className="bh-group-avatar-crop-viewport"
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
              style={{
                width: renderWidth,
                height: renderHeight,
                transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
              }}
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
        <label htmlFor="bh-group-avatar-zoom">{t('group.avatarCrop.zoom')}</label>
        <input
          id="bh-group-avatar-zoom"
          type="range"
          min={1}
          max={3}
          step={0.05}
          value={zoom}
          onChange={(event) => {
            const next = Number(event.target.value);
            setZoom(next);
            if (!dimensions) return;
            const nextX = Math.max(0, (dimensions.width * base * next - PREVIEW_SIZE) / 2);
            const nextY = Math.max(0, (dimensions.height * base * next - PREVIEW_SIZE) / 2);
            setOffset({ x: clamp(offset.x, nextX), y: clamp(offset.y, nextY) });
          }}
        />
      </div>
    </FormDialog>
  );
}
