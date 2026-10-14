import { useRef, useState, type ReactElement } from 'react';

import { FormDialog } from './ds/form-dialog.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';

const PREVIEW_SIZE = 280;
const OUTPUT_SIZE = 512;
const MAX_AVATAR_BYTES = 131_072;
const MAX_BANNER_BYTES = 2_000_000;
const BANNER_WIDTHS = [1500, 1200, 900, 600];
const MAX_SOURCE_BYTES = 5_000_000;

function decodedBase64Bytes(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

function encodeAvatar(canvas: HTMLCanvasElement): string {
  for (let quality = 0.85; quality >= 0.5; quality -= 0.05) {
    const dataUrl = canvas.toDataURL('image/webp', quality);
    if (!dataUrl.startsWith('data:image/webp;base64,')) throw new Error('unsupported canvas');
    if (decodedBase64Bytes(dataUrl) <= MAX_AVATAR_BYTES) return dataUrl;
  }
  throw new Error('avatar too large');
}

function encodeBanner(canvas: HTMLCanvasElement): string {
  for (const width of BANNER_WIDTHS) {
    const target = document.createElement('canvas');
    target.width = width;
    target.height = width / 3;
    const context = target.getContext('2d');
    if (!context) throw new Error('canvas unavailable');
    context.drawImage(canvas, 0, 0, target.width, target.height);
    const dataUrl = target.toDataURL('image/png');
    if (!dataUrl.startsWith('data:image/png;base64,')) throw new Error('unsupported canvas');
    if (decodedBase64Bytes(dataUrl) <= MAX_BANNER_BYTES) return dataUrl;
  }
  throw new Error('banner too large');
}

interface CropShape {
  previewWidth: number;
  previewHeight: number;
  outputWidth: number;
  outputHeight: number;
  encode(canvas: HTMLCanvasElement): string;
  titleKey: 'profile.avatar.crop.title' | 'profile.banner.crop.title';
  descriptionKey: 'profile.avatar.crop.description' | 'profile.banner.crop.description';
}

const AVATAR_CROP: CropShape = {
  previewWidth: PREVIEW_SIZE,
  previewHeight: PREVIEW_SIZE,
  outputWidth: OUTPUT_SIZE,
  outputHeight: OUTPUT_SIZE,
  encode: encodeAvatar,
  titleKey: 'profile.avatar.crop.title',
  descriptionKey: 'profile.avatar.crop.description',
};

const BANNER_CROP: CropShape = {
  previewWidth: 360,
  previewHeight: 120,
  outputWidth: 1500,
  outputHeight: 500,
  encode: encodeBanner,
  titleKey: 'profile.banner.crop.title',
  descriptionKey: 'profile.banner.crop.description',
};

interface CropModalProps {
  file: File;
  t: BotHarnessTranslate;
  onClose: () => void;
  onSave: (image: string) => Promise<boolean>;
}

export function PersonaBotAvatarCropModal(props: CropModalProps): ReactElement {
  return <ImageCropModal {...props} shape={AVATAR_CROP} />;
}

export function BannerCropModal(props: CropModalProps): ReactElement {
  return <ImageCropModal {...props} shape={BANNER_CROP} />;
}

function ImageCropModal({
  file,
  t,
  onClose,
  onSave,
  shape,
}: CropModalProps & { shape: CropShape }): ReactElement {
  const { previewWidth, previewHeight, outputWidth, outputHeight } = shape;
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
      file.size > MAX_SOURCE_BYTES
    ) {
      setError(true);
      return;
    }
    const url = URL.createObjectURL(file);
    setSource(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const base = dimensions
    ? Math.max(previewWidth / dimensions.width, previewHeight / dimensions.height)
    : 1;
  const renderWidth = dimensions ? dimensions.width * base * zoom : previewWidth;
  const renderHeight = dimensions ? dimensions.height * base * zoom : previewHeight;
  const boundX = Math.max(0, (renderWidth - previewWidth) / 2);
  const boundY = Math.max(0, (renderHeight - previewHeight) / 2);
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
        canvas.width = outputWidth;
        canvas.height = outputHeight;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('canvas unavailable');
        const scale = outputWidth / previewWidth;
        context.drawImage(
          bitmap,
          ((previewWidth - renderWidth) / 2 + offset.x) * scale,
          ((previewHeight - renderHeight) / 2 + offset.y) * scale,
          renderWidth * scale,
          renderHeight * scale,
        );
        if (await onSave(shape.encode(canvas))) onClose();
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
      title={t(shape.titleKey)}
      description={t(shape.descriptionKey)}
      labels={{ close: t('common.close'), cancel: t('common.cancel') }}
      submitLabel={t('profile.avatar.crop.save')}
      submitDisabled={!dimensions || busy}
      error={error ? t('profile.avatar.crop.error') : undefined}
      onCancel={onClose}
      onSubmit={() => void save()}
    >
      <div className="bh-group-avatar-crop" ref={sourceMount}>
        <div
          className="bh-group-avatar-crop-viewport"
          style={{ width: previewWidth, height: previewHeight }}
          role="img"
          tabIndex={0}
          aria-label={t('profile.avatar.crop.move')}
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
        <label htmlFor="bh-personabot-avatar-zoom">{t('profile.avatar.crop.zoom')}</label>
        <input
          id="bh-personabot-avatar-zoom"
          type="range"
          min={1}
          max={3}
          step={0.05}
          value={zoom}
          onChange={(event) => {
            const next = Number(event.target.value);
            setZoom(next);
            if (!dimensions) return;
            const nextX = Math.max(0, (dimensions.width * base * next - previewWidth) / 2);
            const nextY = Math.max(0, (dimensions.height * base * next - previewHeight) / 2);
            setOffset({ x: clamp(offset.x, nextX), y: clamp(offset.y, nextY) });
          }}
        />
      </div>
    </FormDialog>
  );
}
