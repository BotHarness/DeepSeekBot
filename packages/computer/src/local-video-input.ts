import { parseDesktopInput } from './desktop-view.js';
import { LocalVideoError, type LocalVideoInput } from './local-video-contract.js';

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

export function driverFailed(result: unknown): boolean {
  return (
    typeof result === 'object' && result !== null && 'isError' in result && result.isError === true
  );
}

export function macCursorOverlayUnavailable(result: unknown): boolean {
  if (
    !driverFailed(result) ||
    typeof result !== 'object' ||
    result === null ||
    !('structuredContent' in result)
  )
    return false;
  const value = result.structuredContent;
  if (typeof value !== 'object' || value === null || !('refusal' in value)) return false;
  const refusal = value.refusal;
  return (
    typeof refusal === 'object' &&
    refusal !== null &&
    'code' in refusal &&
    refusal.code === 'facility_unavailable' &&
    'facility' in refusal &&
    refusal.facility === 'macos_cursor_overlay'
  );
}

export function cursorEnabled(result: unknown, session: string): boolean {
  const value =
    typeof result === 'object' && result !== null && 'structuredContent' in result
      ? result.structuredContent
      : undefined;
  if (
    driverFailed(result) ||
    typeof value !== 'object' ||
    value === null ||
    !('session' in value) ||
    value.session !== session ||
    !('enabled' in value) ||
    typeof value.enabled !== 'boolean'
  )
    throw new LocalVideoError('input-failed', 'The Computer driver did not confirm pointer setup.');
  return value.enabled;
}
