import { isHostColor, isHostIcon, type HostLooks } from '../../../../apps/mobile/src/host/host-look.js';
import {
  withHostColor,
  withHostIcon,
  withHostName,
  type HostLook,
} from '../../../../apps/mobile/src/ui/design/host-look.js';
import { AppearanceError, object } from './appearance.js';

export async function controlHostLook(
  looks: HostLooks,
  input: unknown,
  expectedRevision: unknown,
  request: { expiresAt: number; signal: AbortSignal },
  available: (hostId: string) => boolean,
) {
  const value = object(input);
  const hostId = value.hostId;
  const check = () => {
    if (request.signal.aborted) throw new AppearanceError('host-look-cancelled');
    if (!Number.isFinite(request.expiresAt) || Date.now() >= request.expiresAt)
      throw new AppearanceError('appearance-request-stale');
    if (typeof hostId !== 'string' || !available(hostId))
      throw new AppearanceError('host-look-host-unknown');
  };
  check();
  if (typeof hostId !== 'string') throw new AppearanceError('host-look-host-unknown');
  if (value.refresh !== undefined && (value.refresh !== true || value.patch !== undefined))
    throw new AppearanceError('host-look-invalid-input');
  let transform: ((current: HostLook) => HostLook) | undefined;
  if (value.patch !== undefined) {
    if (typeof expectedRevision !== 'string')
      throw new AppearanceError('host-look-revision-required');
    const patch = object(value.patch);
    const keys = Object.keys(patch);
    if (keys.length === 0 || keys.some((key) => !['name', 'icon', 'color'].includes(key)))
      throw new AppearanceError('host-look-invalid-input');
    if (('name' in patch && typeof patch.name !== 'string') ||
      ('icon' in patch && !isHostIcon(patch.icon)) ||
      ('color' in patch && patch.color !== null && !isHostColor(patch.color)))
      throw new AppearanceError('host-look-invalid-input');
    transform = (current) => {
      if (expectedRevision !== JSON.stringify(current))
        throw new AppearanceError('host-look-revision-stale');
      let next = current;
      if (typeof patch.name === 'string') next = withHostName(next, patch.name);
      if (isHostIcon(patch.icon)) next = withHostIcon(next, patch.icon);
      if (patch.color === null || isHostColor(patch.color))
        next = withHostColor(next, patch.color === null ? undefined : patch.color);
      return next;
    };
  }
  try {
    await looks.ready;
    check();
    if (value.refresh === true) await looks.refresh(check);
    const look = transform === undefined
      ? await looks.read(hostId, check)
      : await looks.update(hostId, transform, check);
    return { hostId, look, revision: JSON.stringify(look) };
  } catch (error) {
    if (error instanceof AppearanceError) throw error;
    throw new AppearanceError(error instanceof Error ? error.message : 'host-look-storage-failed');
  }
}
