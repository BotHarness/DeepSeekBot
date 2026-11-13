import { domToBlob } from 'modern-screenshot';

import { requestScreen, screenshotName } from './bug-report-annotate.js';

export const CAPTURE_DOCK_ATTRIBUTE = 'data-bug-report-dock';
const PAGE_CAPTURE_TIMEOUT_MS = 15_000;

export type CaptureKind = 'screen' | 'page' | 'window';

export interface CaptureSource {
  readonly kind: CaptureKind;
  grab(now?: Date): Promise<File>;
  stop(): void;
}

interface CaptureHost {
  readonly navigator?: Parameters<typeof requestScreen>[0];
  readonly dshDesktop?: unknown;
}

export function prefersScreenShare(host: CaptureHost): boolean {
  if ('dshDesktop' in host) return false;
  return typeof host.navigator?.mediaDevices?.getDisplayMedia === 'function';
}

export async function openCapture(host: CaptureHost = globalThis): Promise<CaptureSource> {
  const desktop = host.dshDesktop;
  if (
    typeof desktop === 'object' &&
    desktop !== null &&
    'protocolVersion' in desktop &&
    desktop.protocolVersion === 1 &&
    'captureWindow' in desktop &&
    typeof desktop.captureWindow === 'function'
  ) {
    const capture = desktop.captureWindow.bind(desktop);
    return windowCapture(() => capture());
  }
  if (prefersScreenShare(host)) {
    const stream = await requestScreen(host.navigator).catch(() => undefined);
    if (stream !== undefined) return screenCapture(stream);
  }
  return pageCapture();
}

function windowCapture(capture: () => Promise<unknown>): CaptureSource {
  let stopped = false;
  return {
    kind: 'window',
    async grab(now = new Date()) {
      if (stopped) throw new Error('capture-stopped');
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const result = await Promise.race([
          capture(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error('capture-timeout')), 3_000);
          }),
        ]);
        if (stopped) throw new Error('capture-stopped');
        if (
          typeof result !== 'object' ||
          result === null ||
          !('mediaType' in result) ||
          result.mediaType !== 'image/png' ||
          !('bytes' in result) ||
          !(result.bytes instanceof Uint8Array) ||
          result.bytes.byteLength > 25 * 1024 * 1024
        )
          throw new Error('capture-failed');
        const bytes = result.bytes;
        if (![137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)) {
          throw new Error('capture-failed');
        }
        return new File([new Uint8Array(bytes)], screenshotName(now), { type: 'image/png' });
      } finally {
        clearTimeout(timer);
      }
    },
    stop() {
      stopped = true;
    },
  };
}

function skipped(node: Node): boolean {
  if (!(node instanceof Element)) return false;
  if (node.hasAttribute(CAPTURE_DOCK_ATTRIBUTE)) return true;
  if (typeof node.checkVisibility !== 'function' || node.checkVisibility()) return false;
  return getComputedStyle(node).display !== 'contents';
}

export function pageCapture(): CaptureSource {
  return {
    kind: 'page',
    async grab(now = new Date()) {
      const body = document.body;
      const blob = await domToBlob(body, {
        width: window.innerWidth,
        height: window.innerHeight,
        scale: Math.min(Math.max(window.devicePixelRatio || 1, 1), 2),
        backgroundColor: getComputedStyle(body).backgroundColor,
        filter: (node) => !skipped(node),
        timeout: PAGE_CAPTURE_TIMEOUT_MS,
        font: false,
        style: { margin: '0' },
      });
      if (blob === null || blob.size === 0) throw new Error('capture-failed');
      return new File([blob], screenshotName(now), { type: 'image/png' });
    },
    stop() {},
  };
}

function screenCapture(stream: MediaStream): CaptureSource {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  const playing = video.play();
  const fallback = pageCapture();
  const live = () => stream.getVideoTracks().some((track) => track.readyState === 'live');
  return {
    kind: 'screen',
    async grab(now = new Date()) {
      if (!live()) return fallback.grab(now);
      await playing;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');
      if (context === null || canvas.width === 0) throw new Error('capture-failed');
      context.drawImage(video, 0, 0);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (blob === null) throw new Error('capture-failed');
      return new File([blob], screenshotName(now), { type: 'image/png' });
    },
    stop() {
      for (const track of stream.getTracks()) track.stop();
      video.srcObject = null;
    },
  };
}

interface ClipboardHost {
  readonly navigator?: {
    readonly clipboard?: { write?: (items: ClipboardItem[]) => Promise<void> };
  };
  readonly ClipboardItem?: typeof ClipboardItem;
}

export function canCopyImage(host: ClipboardHost = globalThis): boolean {
  return (
    typeof host.ClipboardItem === 'function' &&
    typeof host.navigator?.clipboard?.write === 'function'
  );
}

export async function copyImage(file: Blob, host: ClipboardHost = globalThis): Promise<void> {
  const Item = host.ClipboardItem;
  const write = host.navigator?.clipboard?.write;
  if (Item === undefined || write === undefined) throw new Error('clipboard-unavailable');
  const png = file.type === 'image/png' ? file : await toPng(file);
  await write.call(host.navigator?.clipboard, [new Item({ 'image/png': png })]);
}

async function toPng(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (blob === null) throw new Error('clipboard-unavailable');
  return blob;
}

export function afterPaint(delayMs = 0): Promise<void> {
  return new Promise((resolve) =>
    requestAnimationFrame(() =>
      requestAnimationFrame(() => (delayMs > 0 ? setTimeout(resolve, delayMs) : resolve())),
    ),
  );
}
