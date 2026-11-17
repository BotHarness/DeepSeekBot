import { importWallpaperImage, pickWallpaper } from '../../src/host/native-app-wallpaper';
import { AppearanceSettingsContent, type WallpaperPorts } from '../../src/ui/appearance-settings';
import { useAppearance } from '../../src/ui/native-appearance';

async function pickAsDocument() {
  const picked = await pickWallpaper();
  if (picked === undefined) return undefined;
  if (picked.kind === 'video-unavailable') return 'video-unavailable' as const;
  const id = await importWallpaperImage(picked);
  return { kind: 'image' as const, id, fit: 'cover' as const, x: 0.5, y: 0.5, fade: 60 };
}

const wallpaperPorts: WallpaperPorts = { pick: pickAsDocument };

export default function AppearanceSettingsScreen() {
  const snapshot = useAppearance();
  return <AppearanceSettingsContent snapshot={snapshot} wallpaper={wallpaperPorts} />;
}
