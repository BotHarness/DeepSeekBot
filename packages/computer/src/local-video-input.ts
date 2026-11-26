import { desktopInputCall, parseDesktopInput, type DesktopInput } from './desktop-view.js';
import {
  LocalVideoError,
  type LocalVideoBinding,
  type LocalVideoInput,
} from './local-video-contract.js';
import type { OperationTrace } from './local-video-trace.js';
import type { CuaDriver } from './tool/driver.js';

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

function macCursorOverlayUnavailable(result: unknown): boolean {
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

function cursorEnabled(result: unknown, session: string): boolean {
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

export function inputOutsideDesktop(
  input: LocalVideoInput,
  { width, height }: { width: number; height: number },
): boolean {
  return (
    (input.kind === 'click' || input.kind === 'scroll' || input.kind === 'scroll-motion') &&
    ((input.x !== undefined && (input.x < 0 || input.x >= width)) ||
      (input.y !== undefined && (input.y < 0 || input.y >= height)))
  );
}

export function requireMatchingInputGeometry(
  result: unknown,
  display: { width: number; height: number },
  useScaleFactor: boolean,
): number {
  const geometry =
    typeof result === 'object' && result !== null && 'structuredContent' in result
      ? result.structuredContent
      : undefined;
  const scaleFactor =
    typeof geometry === 'object' && geometry !== null && 'scale_factor' in geometry
      ? geometry.scale_factor
      : undefined;
  const scale = useScaleFactor ? scaleFactor : 1;
  if (
    driverFailed(result) ||
    typeof scale !== 'number' ||
    !Number.isFinite(scale) ||
    scale < 1 ||
    scale > 4 ||
    typeof geometry !== 'object' ||
    geometry === null ||
    !('width' in geometry) ||
    !('height' in geometry) ||
    typeof geometry.width !== 'number' ||
    typeof geometry.height !== 'number' ||
    Math.round(geometry.width * scale) !== display.width ||
    Math.round(geometry.height * scale) !== display.height
  )
    throw new LocalVideoError(
      'media-not-live',
      'The input display does not match the video. Reconnect the viewer.',
    );
  return scale;
}

export async function sendLocalVideoInput({
  driver,
  driverPlatform,
  input,
  viewer,
  signal,
  checkGrant,
  operationTimeout,
  trace,
}: {
  driver: Pick<CuaDriver, 'call'>;
  driverPlatform: 'darwin' | 'win32' | undefined;
  input: DesktopInput;
  viewer: { readonly binding: LocalVideoBinding; readonly frames: boolean; cursorReady: boolean };
  signal: AbortSignal | undefined;
  checkGrant: () => void;
  operationTimeout: number;
  trace: Pick<OperationTrace, 'source' | 'external'>;
}): Promise<unknown> {
  const call = desktopInputCall(input, undefined);
  trace.source = 'driver';
  trace.external = 'desktop-input';
  const session = 'local-video:' + viewer.binding.viewerId;
  if (!viewer.frames && !viewer.cursorReady) {
    trace.external = 'cursor-setup';
    const setup = await driver.call('set_agent_cursor_enabled', { session, enabled: false });
    const overlayAbsent = driverPlatform === 'darwin' && macCursorOverlayUnavailable(setup);
    if (driverFailed(setup) && !overlayAbsent)
      throw new LocalVideoError('input-failed', 'The Computer driver refused pointer setup.');
    const deadline = Date.now() + operationTimeout;
    while (!overlayAbsent) {
      if (signal?.aborted)
        throw new LocalVideoError('stale-grant', 'Pointer setup was cancelled before execution.');
      checkGrant();
      const state = await driver.call('get_agent_cursor_state', { session });
      if (!cursorEnabled(state, session)) break;
      if (Date.now() >= deadline)
        throw new LocalVideoError('input-failed', 'The Computer pointer setup did not finish.');
      await new Promise<void>((resolve) => setTimeout(resolve, 16));
    }
    viewer.cursorReady = true;
  }
  if (signal?.aborted)
    throw new LocalVideoError('stale-grant', 'The queued input was cancelled before execution.');
  checkGrant();
  trace.external = 'desktop-input';
  return driver.call(call.tool, { ...call.args, session });
}
