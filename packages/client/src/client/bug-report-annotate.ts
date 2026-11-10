export type AnnotationTool = 'box' | 'pen' | 'hide';
export const ANNOTATION_TOOLS: readonly AnnotationTool[] = ['box', 'pen', 'hide'];

export type AnnotationPoint = readonly [number, number];

export type Annotation =
  | {
      readonly tool: 'box' | 'hide';
      readonly x: number;
      readonly y: number;
      readonly w: number;
      readonly h: number;
    }
  | { readonly tool: 'pen'; readonly points: readonly AnnotationPoint[] };

export interface AnnotationDraft {
  readonly tool: AnnotationTool;
  readonly points: readonly AnnotationPoint[];
}

export const ANNOTATION_MIN_SIZE = 4;

export function startAnnotation(tool: AnnotationTool, at: AnnotationPoint): AnnotationDraft {
  return { tool, points: [at] };
}

export function extendAnnotation(draft: AnnotationDraft, at: AnnotationPoint): AnnotationDraft {
  if (draft.tool === 'pen') return { ...draft, points: [...draft.points, at] };
  return { ...draft, points: [draft.points[0]!, at] };
}

export function finishAnnotation(draft: AnnotationDraft): Annotation | undefined {
  if (draft.tool === 'pen')
    return draft.points.length > 1 ? { tool: 'pen', points: draft.points } : undefined;
  const [start, end] = draft.points;
  if (start === undefined || end === undefined) return undefined;
  const w = Math.abs(end[0] - start[0]);
  const h = Math.abs(end[1] - start[1]);
  if (w < ANNOTATION_MIN_SIZE || h < ANNOTATION_MIN_SIZE) return undefined;
  return {
    tool: draft.tool,
    x: Math.min(start[0], end[0]),
    y: Math.min(start[1], end[1]),
    w,
    h,
  };
}

export function canvasPoint(
  rect: { left: number; top: number; width: number; height: number },
  size: { width: number; height: number },
  clientX: number,
  clientY: number,
): AnnotationPoint {
  const scaleX = rect.width === 0 ? 1 : size.width / rect.width;
  const scaleY = rect.height === 0 ? 1 : size.height / rect.height;
  const clamp = (value: number, max: number) => Math.min(max, Math.max(0, value));
  return [
    clamp((clientX - rect.left) * scaleX, size.width),
    clamp((clientY - rect.top) * scaleY, size.height),
  ];
}

export function strokeWidth(size: { width: number; height: number }): number {
  return Math.max(3, Math.round(Math.max(size.width, size.height) / 400));
}

export interface AnnotationPainter {
  strokeStyle: string | CanvasGradient | CanvasPattern;
  fillStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  lineJoin: CanvasLineJoin;
  lineCap: CanvasLineCap;
  save(): void;
  restore(): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  stroke(): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
}

export const REDACTION_FILL = '#000';

export function paintAnnotation(
  painter: AnnotationPainter,
  annotation: Annotation,
  options: { stroke: string; width: number },
): void {
  painter.save();
  if (annotation.tool === 'hide') {
    painter.fillStyle = REDACTION_FILL;
    painter.fillRect(annotation.x, annotation.y, annotation.w, annotation.h);
  } else if (annotation.tool === 'box') {
    painter.strokeStyle = options.stroke;
    painter.lineWidth = options.width;
    painter.strokeRect(annotation.x, annotation.y, annotation.w, annotation.h);
  } else if (annotation.tool === 'pen') {
    painter.strokeStyle = options.stroke;
    painter.lineWidth = options.width;
    painter.lineJoin = 'round';
    painter.lineCap = 'round';
    painter.beginPath();
    annotation.points.forEach(([x, y], index) =>
      index === 0 ? painter.moveTo(x, y) : painter.lineTo(x, y),
    );
    painter.stroke();
  }
  painter.restore();
}

export function previewAnnotation(draft: AnnotationDraft): Annotation | undefined {
  if (draft.tool === 'pen')
    return draft.points.length > 1 ? { tool: 'pen', points: draft.points } : undefined;
  const [start, end] = draft.points;
  if (start === undefined || end === undefined) return undefined;
  return {
    tool: draft.tool,
    x: Math.min(start[0], end[0]),
    y: Math.min(start[1], end[1]),
    w: Math.abs(end[0] - start[0]),
    h: Math.abs(end[1] - start[1]),
  };
}

export function annotatedName(name: string): string {
  const dot = name.lastIndexOf('.');
  const base = dot <= 0 ? name : name.slice(0, dot);
  return `${base.replace(/-annotated$/u, '')}-annotated.png`;
}

export function screenshotName(now = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `screenshot-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.png`;
}

interface DisplayMediaHost {
  readonly mediaDevices?: {
    getDisplayMedia?: (options?: Record<string, unknown>) => Promise<MediaStream>;
  };
}

export function canCaptureScreen(host: DisplayMediaHost | undefined): boolean {
  return typeof host?.mediaDevices?.getDisplayMedia === 'function';
}

export function requestScreen(host: DisplayMediaHost | undefined): Promise<MediaStream> {
  const devices = host?.mediaDevices;
  const capture = devices?.getDisplayMedia;
  if (devices === undefined || capture === undefined)
    return Promise.reject(new Error('capture-unavailable'));
  return capture.call(devices, {
    video: true,
    audio: false,
    preferCurrentTab: true,
    selfBrowserSurface: 'include',
  });
}

export async function grabFrame(stream: MediaStream, now = new Date()): Promise<File> {
  const video = document.createElement('video');
  try {
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    await video.play();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (context === null || canvas.width === 0) throw new Error('capture-failed');
    context.drawImage(video, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (blob === null) throw new Error('capture-failed');
    return new File([blob], screenshotName(now), { type: 'image/png' });
  } finally {
    for (const track of stream.getTracks()) track.stop();
    video.srcObject = null;
  }
}
