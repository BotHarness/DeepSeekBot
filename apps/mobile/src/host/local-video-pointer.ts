import type { DesktopInput } from '../../../../packages/computer/src/desktop-view';
import { fittedFrame, stagePoint, type StageLayout, type StageZoom } from './browser-viewer';

export function videoPointerScroll({
  point,
  frame,
  axis,
  steps,
  driving,
}: {
  point: { x: number; y: number };
  frame: { width: number; height: number };
  axis: 'horizontal' | 'vertical';
  steps: number;
  driving: boolean;
}): Extract<DesktopInput, { kind: 'scroll' }> | undefined {
  const at = inputPoint({ point, frame, driving });
  if (at === undefined || !Number.isSafeInteger(steps) || steps === 0) return undefined;
  return {
    kind: 'scroll',
    ...at,
    direction: axis === 'horizontal' ? (steps > 0 ? 'right' : 'left') : steps > 0 ? 'down' : 'up',
    amount: Math.min(50, Math.abs(steps)),
  };
}

export function resizeVideoPreview({
  frame,
  before,
  after,
  zoom,
}: {
  frame: { width: number; height: number };
  before: StageLayout;
  after: StageLayout;
  zoom: StageZoom;
}): StageZoom {
  'worklet';
  const oldFit = fittedFrame(frame, before);
  const fit = fittedFrame(frame, after);
  if (oldFit.width <= 0 || fit.width <= 0) return zoom;
  return {
    scale: (zoom.scale * oldFit.width) / fit.width,
    x: zoom.x + (before.width - after.width) / 2,
    y: zoom.y + (oldFit.height - fit.height) / 2,
  };
}

export function videoPointerPosition({
  point,
  frame,
  stage,
  zoom,
}: {
  point: { x: number; y: number };
  frame: { width: number; height: number };
  stage: StageLayout;
  zoom: StageZoom;
}): { x: number; y: number } {
  'worklet';
  return stagePoint(point, frame, stage, {
    ...zoom,
    y: zoom.y - fittedFrame(frame, stage).top,
  });
}

export function videoPointerClick({
  point,
  frame,
  button,
  driving,
}: {
  point: { x: number; y: number };
  frame: { width: number; height: number };
  button: 'left' | 'right';
  driving: boolean;
}): Extract<DesktopInput, { kind: 'click' }> | undefined {
  const at = inputPoint({ point, frame, driving });
  return at === undefined ? undefined : { kind: 'click', ...at, button, count: 1 };
}

function inputPoint({
  point,
  frame,
  driving,
}: {
  point: { x: number; y: number };
  frame: { width: number; height: number };
  driving: boolean;
}): { x: number; y: number } | undefined {
  if (
    !driving ||
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.y) ||
    frame.width <= 0 ||
    frame.height <= 0 ||
    point.x < 0 ||
    point.y < 0 ||
    point.x > frame.width ||
    point.y > frame.height
  )
    return undefined;
  return {
    x: Math.min(frame.width - 1, Math.round(point.x)),
    y: Math.min(frame.height - 1, Math.round(point.y)),
  };
}

export function revealVideoPointer({
  point,
  frame,
  stage,
  zoom,
}: {
  point: { x: number; y: number };
  frame: { width: number; height: number };
  stage: StageLayout;
  zoom: StageZoom;
}): StageZoom {
  'worklet';
  const at = videoPointerPosition({ point, frame, stage, zoom });
  const inset = Math.min(24, stage.width / 4, stage.height / 4);
  return {
    ...zoom,
    x: zoom.x + Math.max(inset, Math.min(stage.width - inset, at.x)) - at.x,
    y: zoom.y + Math.max(inset, Math.min(stage.height - inset, at.y)) - at.y,
  };
}
