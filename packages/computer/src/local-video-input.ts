import { parseDesktopInput } from './desktop-view.js';
import type { LocalVideoInput } from './local-video-contract.js';

export function parseLocalVideoInput(body: Record<string, unknown>): LocalVideoInput | undefined {
  if (body['kind'] !== 'scroll-motion') return parseDesktopInput(body);
  const { x, y, vx, vy } = body;
  if (
    typeof x !== 'number' ||
    !Number.isFinite(x) ||
    x < 0 ||
    typeof y !== 'number' ||
    !Number.isFinite(y) ||
    y < 0 ||
    typeof vx !== 'number' ||
    !Number.isFinite(vx) ||
    Math.abs(vx) > 200 ||
    typeof vy !== 'number' ||
    !Number.isFinite(vy) ||
    Math.abs(vy) > 200
  )
    return undefined;
  return { kind: 'scroll-motion', x, y, vx, vy };
}
