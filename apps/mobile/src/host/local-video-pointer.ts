import type { DesktopInput } from '../../../../packages/computer/src/desktop-view';
import { fittedFrame, stagePoint, type StageLayout, type StageZoom } from './browser-viewer';

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
    kind: 'click',
    x: Math.min(frame.width - 1, Math.round(point.x)),
    y: Math.min(frame.height - 1, Math.round(point.y)),
    button,
    count: 1,
  };
}
