import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

const AVATAR_PIXELS = 256;

export async function pickGroupAvatar(): Promise<string | undefined> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
  });
  const asset = result.canceled ? undefined : result.assets[0];
  if (asset === undefined) return undefined;
  const context = ImageManipulator.manipulate(asset.uri);
  const side = Math.min(asset.width, asset.height);
  if (side > 0 && asset.width !== asset.height)
    context.crop({
      originX: (asset.width - side) / 2,
      originY: (asset.height - side) / 2,
      width: side,
      height: side,
    });
  context.resize({ width: AVATAR_PIXELS, height: AVATAR_PIXELS });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8, base64: true });
  return saved.base64 === undefined ? undefined : `data:image/jpeg;base64,${saved.base64}`;
}
