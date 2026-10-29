import { AppearanceError, object, type Appearance } from './appearance.js';
import { WallpaperError } from './wallpaper-store.js';
import type { Wallpaper } from './wallpaper.js';
export async function resetAppearance(
  appearance: Appearance,
  wallpaper: Wallpaper,
  raw: unknown,
  expectedRevision: unknown,
  expiresAt = Infinity,
) {
  const command = object(raw);
  if (
    command.action !== 'reset-all' ||
    command.confirmed !== true ||
    typeof command.wallpaperRevision !== 'string' ||
    typeof expectedRevision !== 'string' ||
    Object.keys(command).some((k) => !['action', 'confirmed', 'wallpaperRevision'].includes(k))
  )
    throw new AppearanceError('appearance-reset-confirmation-required');
  appearance.refresh();
  if (appearance.getSnapshot().error) throw new AppearanceError(appearance.getSnapshot().error!);
  if (appearance.getSnapshot().config.revision !== expectedRevision)
    throw new AppearanceError('appearance-revision-conflict');
  await wallpaper.refresh();
  if (wallpaper.getSnapshot().revision !== command.wallpaperRevision)
    throw new WallpaperError('wallpaper-revision-conflict');
  if (Date.now() > expiresAt) throw new AppearanceError('appearance-request-stale');
  const snapshot = appearance.reset(expectedRevision);
  try {
    await wallpaper.clear(command.wallpaperRevision, expiresAt);
  } catch {
    await wallpaper.refresh().catch(() => {});
    throw new AppearanceError('appearance-reset-wallpaper-failed');
  }
  return { complete: true, snapshot, wallpaper: wallpaper.describe() };
}
