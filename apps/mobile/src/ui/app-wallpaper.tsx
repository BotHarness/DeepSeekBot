import { Image } from 'expo-image';
import { View } from 'react-native';

import { resolveWallpaperSource } from './appearance-model';
import { useDesignTheme } from './design/theme';
import { useAppearance } from './native-appearance';
import { wallpaperMediaUri } from '../host/native-app-wallpaper';

export function useWallpaperActive(): boolean {
  const kind = useAppearance().document.wallpaper?.kind;
  return kind === 'image' || kind === 'video';
}

export function AppWallpaper() {
  const { document } = useAppearance();
  const theme = useDesignTheme();
  const source = resolveWallpaperSource(document, wallpaperMediaUri);
  if (source === undefined) return null;
  return (
    <View
      pointerEvents="none"
      testID="app-wallpaper"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}
    >
      <Image
        source={{ uri: source.uri }}
        contentFit={source.fit}
        contentPosition={{ left: `${source.x * 100}%`, top: `${source.y * 100}%` }}
        transition={0}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: theme.color.base,
          opacity: source.fade / 100,
        }}
      />
    </View>
  );
}
