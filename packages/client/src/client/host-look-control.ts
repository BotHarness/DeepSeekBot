import type { HostLooks } from '../../../../apps/mobile/src/host/host-look.js';
import {
  HOST_COLORS,
  HOST_EMOJI,
  HOST_SYMBOLS,
  withHostColor,
  withHostIcon,
  withHostName,
  type HostColorId,
  type HostSymbolId,
} from '../../../../apps/mobile/src/ui/design/host-look.js';
import { AppearanceError, object } from './appearance.js';

export function controlHostLook(
  looks: HostLooks,
  input: unknown,
  expectedRevision: unknown,
  request: { expiresAt: number; signal: AbortSignal },
  available: (hostId: string) => boolean,
) {
  const check = () => {
    if (request.signal.aborted) throw new AppearanceError('host-look-cancelled');
    if (!Number.isFinite(request.expiresAt) || Date.now() >= request.expiresAt)
      throw new AppearanceError('appearance-request-stale');
  };
  check();
  const value = object(input);
  const hostId = value.hostId;
  if (typeof hostId !== 'string' || !available(hostId))
    throw new AppearanceError('host-look-host-unknown');
  const current = looks.look(hostId);
  if (value.patch !== undefined) {
    if (typeof expectedRevision !== 'string')
      throw new AppearanceError('host-look-revision-required');
    if (expectedRevision !== JSON.stringify(current))
      throw new AppearanceError('host-look-revision-stale');
    const patch = object(value.patch);
    const keys = Object.keys(patch);
    if (keys.length === 0 || keys.some((key) => !['name', 'icon', 'color'].includes(key)))
      throw new AppearanceError('host-look-invalid-input');
    let next = current;
    if ('name' in patch) {
      if (typeof patch.name !== 'string') throw new AppearanceError('host-look-invalid-input');
      next = withHostName(next, patch.name);
    }
    if ('icon' in patch) {
      const icon = object(patch.icon);
      if (icon.kind === 'symbol' && typeof icon.id === 'string' && Object.hasOwn(HOST_SYMBOLS, icon.id))
        next = withHostIcon(next, { kind: 'symbol', id: icon.id as HostSymbolId });
      else if (icon.kind === 'emoji' && typeof icon.emoji === 'string' && (HOST_EMOJI as readonly string[]).includes(icon.emoji))
        next = withHostIcon(next, { kind: 'emoji', emoji: icon.emoji });
      else throw new AppearanceError('host-look-invalid-input');
    }
    if ('color' in patch) {
      if (patch.color !== null && (typeof patch.color !== 'string' || !Object.hasOwn(HOST_COLORS, patch.color)))
        throw new AppearanceError('host-look-invalid-input');
      next = withHostColor(next, patch.color === null ? undefined : patch.color as HostColorId);
    }
    check();
    if (!available(hostId)) throw new AppearanceError('host-look-host-unknown');
    if (expectedRevision !== JSON.stringify(looks.look(hostId)))
      throw new AppearanceError('host-look-revision-stale');
    try {
      looks.set(hostId, next);
    } catch {
      throw new AppearanceError('host-look-storage-failed');
    }
  }
  const look = looks.look(hostId);
  return { hostId, look, revision: JSON.stringify(look) };
}
