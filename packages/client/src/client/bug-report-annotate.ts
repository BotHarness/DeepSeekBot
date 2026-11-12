export type AnnotationTool = 'box' | 'pen' | 'text' | 'hide';
export const ANNOTATION_TOOLS: readonly AnnotationTool[] = ['box', 'pen', 'text', 'hide'];
export type DragTool = Exclude<AnnotationTool, 'text'>;
export const ANNOTATION_TEXT_CHARS = 120;

export type AnnotationPoint = readonly [number, number];

export type Annotation =
  | {
      readonly tool: 'box' | 'hide';
      readonly x: number;
      readonly y: number;
      readonly w: number;
      readonly h: number;
    }
  | { readonly tool: 'pen'; readonly points: readonly AnnotationPoint[] }
  | { readonly tool: 'text'; readonly x: number; readonly y: number; readonly text: string };

export interface AnnotationDraft {
  readonly tool: DragTool;
  readonly points: readonly AnnotationPoint[];
}

export const ANNOTATION_MIN_SIZE = 4;

export function startAnnotation(tool: DragTool, at: AnnotationPoint): AnnotationDraft {
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

export function labelSize(size: { width: number; height: number }): number {
  return Math.max(14, Math.round(Math.max(size.width, size.height) / 80));
}

export function textAnnotation(
  at: AnnotationPoint,
  text: string,
): Extract<Annotation, { tool: 'text' }> | undefined {
  const value = text.trim().slice(0, ANNOTATION_TEXT_CHARS);
  return value === '' ? undefined : { tool: 'text', x: at[0], y: at[1], text: value };
}

export function boxNoteAnchor(
  box: { x: number; y: number; w: number; h: number },
  size: { width: number; height: number },
): AnnotationPoint {
  const gap = strokeWidth(size) * 2;
  const below = box.y + box.h + gap;
  return [box.x, below + labelSize(size) * 1.6 <= size.height ? below : Math.max(0, box.y + gap)];
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
  font: string;
  textBaseline: CanvasTextBaseline;
  fillText(text: string, x: number, y: number): void;
  measureText(text: string): { width: number };
}

export const REDACTION_FILL = '#000';
export const LABEL_TEXT = '#fff';

export function paintAnnotation(
  painter: AnnotationPainter,
  annotation: Annotation,
  options: { stroke: string; width: number; label?: number; canvasWidth?: number },
): void {
  painter.save();
  if (annotation.tool === 'text') {
    const font = options.label ?? 14;
    const pad = Math.round(font * 0.35);
    painter.font = `600 ${font}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    painter.textBaseline = 'top';
    const width = painter.measureText(annotation.text).width + pad * 2;
    const height = Math.round(font * 1.3) + pad;
    const limit = options.canvasWidth ?? Number.POSITIVE_INFINITY;
    const x = Math.max(0, Math.min(annotation.x, limit - width));
    painter.fillStyle = options.stroke;
    painter.fillRect(x, annotation.y, width, height);
    painter.fillStyle = LABEL_TEXT;
    painter.fillText(annotation.text, x + pad, annotation.y + pad);
    painter.restore();
    return;
  }
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
