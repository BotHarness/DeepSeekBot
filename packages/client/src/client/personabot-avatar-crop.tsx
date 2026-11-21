import { useRef, useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';

import { joinClass } from './ds/class-name.js';
import { FormDialog } from './ds/form-dialog.js';
import { layer, space, style } from './ds/tobs.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';

import {
  MAX_MARKETPLACE_AVATAR_BYTES,
  MAX_MARKETPLACE_AVATAR_SIDE,
  MIN_MARKETPLACE_AVATAR_SIDE,
} from '@botharness/host-protocol/marketplace-avatar';
import { readMarketplaceAvatarImage } from '@botharness/host-protocol/marketplace-avatar-image';

const styles = stylex.create({
  crop: { display: 'grid', gap: space.x3 },
  viewport: {
    position: 'relative',
    overflow: 'hidden',
    marginInline: 'auto',
    backgroundColor: layer.well,
    borderRadius: style.radiusCard,
    cursor: 'grab',
    touchAction: 'none',
  },
  image: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    maxWidth: 'none',
    pointerEvents: 'none',
  },
});

function encodeMarketplaceAvatar(canvas: HTMLCanvasElement): string {
  const png = canvas.toDataURL('image/png');
  if (decodedBase64Bytes(png) <= MAX_MARKETPLACE_AVATAR_BYTES && readMarketplaceAvatarImage(png))
    return png;
  for (const type of ['image/webp', 'image/jpeg']) {
    for (const quality of [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1]) {
      const dataUrl = canvas.toDataURL(type, quality);
      if (!dataUrl.startsWith(`data:${type};base64,`)) break;
      if (
        decodedBase64Bytes(dataUrl) <= MAX_MARKETPLACE_AVATAR_BYTES &&
        readMarketplaceAvatarImage(dataUrl)
      )
        return dataUrl;
    }
  }
  throw new Error('avatar too large');
}

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

export function PersonaBotAvatarCropModal({
  marketplace = false,
  ...props
}: CropModalProps & { marketplace?: boolean }): ReactElement {
  return <ImageCropModal {...props} shape={AVATAR_CROP} marketplace={marketplace} />;
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
  marketplace = false,
}: CropModalProps & { shape: CropShape; marketplace?: boolean }): ReactElement {
  const { previewWidth, previewHeight, outputWidth, outputHeight } = shape;
  const [source, setSource] = useState<string>();
  const [dimensions, setDimensions] = useState<{
    width: number;
    height: number;
  }>();
  const sourceSide = dimensions === undefined ? 0 : Math.min(dimensions.width, dimensions.height);
  const [zoom, setZoom] = useState(1);
  const croppedSide = Math.floor(sourceSide / zoom);
  const tooSmall =
    marketplace && dimensions !== undefined && croppedSide < MIN_MARKETPLACE_AVATAR_SIDE;
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
    if (!dimensions || tooSmall) return;
    setBusy(true);
    setError(false);
    try {
      const bitmap = await createImageBitmap(file);
      try {
        const canvas = document.createElement('canvas');
        const side = Math.min(croppedSide, MAX_MARKETPLACE_AVATAR_SIDE);
        canvas.width = marketplace ? side : outputWidth;
        canvas.height = marketplace ? side : outputHeight;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('canvas unavailable');
        const scale = canvas.width / previewWidth;
        context.drawImage(
          bitmap,
          ((previewWidth - renderWidth) / 2 + offset.x) * scale,
          ((previewHeight - renderHeight) / 2 + offset.y) * scale,
          renderWidth * scale,
          renderHeight * scale,
        );
        if (await onSave(marketplace ? encodeMarketplaceAvatar(canvas) : shape.encode(canvas)))
          onClose();
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
      title={t(marketplace ? 'market.avatar.cropTitle' : shape.titleKey)}
      description={t(marketplace ? 'market.avatar.cropDescription' : shape.descriptionKey)}
      labels={{ close: t('common.close'), cancel: t('common.cancel') }}
      submitLabel={t('profile.avatar.crop.save')}
      submitDisabled={!dimensions || tooSmall || busy}
      error={
        tooSmall ? t('market.avatar.tooSmall') : error ? t('profile.avatar.crop.error') : undefined
      }
      onCancel={onClose}
      onSubmit={() => void save()}
    >
      <div
        className={joinClass(
          'bh-group-avatar-crop',
          stylex.props(marketplace && styles.crop).className,
        )}
        ref={sourceMount}
      >
        <div
          className={joinClass(
            'bh-group-avatar-crop-viewport',
            stylex.props(marketplace && styles.viewport).className,
          )}
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
              {...stylex.props(marketplace && styles.image)}
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
