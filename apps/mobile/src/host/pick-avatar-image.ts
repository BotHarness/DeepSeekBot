import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import {
  MAX_MARKETPLACE_AVATAR_SIDE,
  MIN_MARKETPLACE_AVATAR_SIDE,
} from '@botharness/host-protocol/marketplace-avatar';
import { readMarketplaceAvatarImage } from '@botharness/host-protocol/marketplace-avatar-image';

const AVATAR_PIXELS = 256;

async function pickSquarePhoto() {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
  });
  return result.canceled ? undefined : result.assets[0];
}

export async function pickAvatarImage(): Promise<string | undefined> {
  const asset = await pickSquarePhoto();
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

export class MarketplaceAvatarTooSmall extends Error {}

export async function pickMarketplaceAvatarImage(): Promise<string | undefined> {
  const photo = await pickSquarePhoto();
  if (photo) return prepareMarketplaceAvatarImage(photo.uri, photo);
}

export async function prepareMarketplaceAvatarImage(
  uri: string,
  dimensions?: { width: number; height: number },
): Promise<string> {
  if (dimensions && Math.min(dimensions.width, dimensions.height) < MIN_MARKETPLACE_AVATAR_SIDE)
    throw new MarketplaceAvatarTooSmall();
  const context = ImageManipulator.manipulate(uri);
  try {
    let size = dimensions;
    if (size === undefined) {
      const original = await context.renderAsync();
      size = { width: original.width, height: original.height };
      original.release();
    }
    const { width, height } = size;
    const side = Math.min(width, height);
    if (side < MIN_MARKETPLACE_AVATAR_SIDE) throw new MarketplaceAvatarTooSmall();
    if (width !== height) {
      context.crop({
        originX: Math.floor((width - side) / 2),
        originY: Math.floor((height - side) / 2),
        width: side,
        height: side,
      });
    }
    const output = Math.min(side, MAX_MARKETPLACE_AVATAR_SIDE);
    if (side !== output) context.resize({ width: output, height: output });
    const image = await context.renderAsync();
    try {
      for (const compress of [0.9, 0.75, 0.55, 0.35, 0.15, 0]) {
        const saved = await image.saveAsync({ format: SaveFormat.WEBP, compress, base64: true });
        new File(saved.uri).delete();
        const data = `data:image/webp;base64,${saved.base64 ?? ''}`;
        if (readMarketplaceAvatarImage(data)) return data;
      }
      throw new Error('unprocessed-image');
    } finally {
      image.release();
    }
  } finally {
    context.release();
  }
}
