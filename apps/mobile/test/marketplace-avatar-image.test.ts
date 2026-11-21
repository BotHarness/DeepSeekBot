import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readMarketplaceAvatarImage } from '@botharness/host-protocol/marketplace-avatar-image';
import { avatarFixtures } from '../../../packages/market/test/avatar-fixtures.js';

const native = vi.hoisted(() => ({
  pick: vi.fn(),
  crop: vi.fn(),
  resize: vi.fn(),
  save: vi.fn(),
  release: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('expo-image-picker', () => ({ launchImageLibraryAsync: native.pick }));
vi.mock('expo-file-system', () => ({
  File: class {
    delete = native.delete;
  },
}));
vi.mock('expo-image-manipulator', () => ({
  SaveFormat: { WEBP: 'webp' },
  ImageManipulator: {
    manipulate: () => ({
      crop: native.crop,
      resize: native.resize,
      release: native.release,
      renderAsync: async () => ({
        width: 256,
        height: 256,
        saveAsync: native.save,
        release: native.release,
      }),
    }),
  },
}));

import {
  MarketplaceAvatarTooSmall,
  pickMarketplaceAvatarImage,
  prepareMarketplaceAvatarImage,
} from '../src/host/pick-avatar-image';

const largeFixture =
  'UklGRoACAABXRUJQVlA4IHQCAABQOwCdASoAAgACPpFIoU0lpCMiIAgAsBIJaW7hd1lwH4AAAE9gHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5xEXJyHvtk5D32ych77cy/T2ych77ZOQ99snIfQvpdrxcnIe+2TkPfbJziIuTkPfbJyHvtk5D325l+ntk5D32ych77ZOQ+hfS7Xi5OQ99snIe+2TnERcnIe+2TkPfbJyHvtzL9PbJyHvtk5D32ych9C+l2vFych77ZOQ99snOIi5OQ99snIe+2TkPfbmX6e2TkPfbJyHvtk5D6F9LteLk5D32ych77ZOcRFych77ZOQ99snIe+3Mv09snIe+2TkPfbJyH0L6Xa8XJyHvtk5D32yc4iLk5D32ych77ZOQ99uZfp7ZOQ99snIe+2TkPoX0u14uTkPfbJyHvtk5xEXJyHvtk5D32ych77cy/T2ych77ZOQ99snIfQvpdrxcnIe+2TkPfbJziIuTkPfbJyHvtk5D325l+ntk5D32ych77ZOQ+hfS7Xi5OQ99snIe+2TnERcnIe+2TkPfbJyHvtzL9PbJyHvtk5D32ych9C+l2vFych77ZOQ99snOIi5OQ99snIe+2TkPfbmX6e2TkPfbJyHvtk5D6F9LteLk5D32ych77VgAA/v+lm///1lfzK/mV/vkf//jduMN98xnWVMeKY8Ux4pjxTHimPFMeKY8Ux4pjxTHimPFMeKY8UxY2IQCAB038Jd8Qxr+Eu+IY1/CXfEMa/hLviGNfwl3xDGv4S74hjX8Jd8Qxr+Eu+IY1/CXfEMa/hLviGNfwl3xDGv4S74hjX8Jd8Qxr+Eu+IY1/CXfEAAAA';

function photo(width: number, height: number) {
  native.pick.mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file:///crop.png', width, height }],
  });
}

describe('mobile Marketplace Avatar images', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    native.save.mockResolvedValue({ uri: 'file:///encoded.webp', base64: avatarFixtures.webp });
  });

  it('uses the existing square system crop and preserves a 256 px crop with compliant bytes', async () => {
    photo(256, 256);
    const data = await pickMarketplaceAvatarImage();
    expect(native.pick).toHaveBeenCalledWith(
      expect.objectContaining({ allowsEditing: true, aspect: [1, 1] }),
    );
    expect(native.resize).not.toHaveBeenCalled();
    expect(native.save).toHaveBeenCalledWith({ format: 'webp', compress: 0.9, base64: true });
    expect(readMarketplaceAvatarImage(data ?? '')?.bytes).toEqual(
      Uint8Array.from(Buffer.from(avatarFixtures.webp, 'base64')),
    );
  });

  it('centers a rectangular crop, caps the side at 512 and retries rejected encodings', async () => {
    photo(900, 600);
    const metadata = Buffer.from(largeFixture, 'base64');
    metadata.writeUInt32LE(metadata.length, 4);
    const withMetadata = Buffer.concat([metadata, Buffer.from('EXIF\0\0\0\0')]);
    native.save
      .mockResolvedValueOnce({
        uri: 'file:///first.webp',
        base64: Buffer.alloc(128 * 1024 + 1).toString('base64'),
      })
      .mockResolvedValueOnce({
        uri: 'file:///second.webp',
        base64: withMetadata.toString('base64'),
      })
      .mockResolvedValueOnce({ uri: 'file:///third.webp', base64: largeFixture });
    const data = await pickMarketplaceAvatarImage();
    expect(native.crop).toHaveBeenCalledWith({ originX: 150, originY: 0, width: 600, height: 600 });
    expect(native.resize).toHaveBeenCalledWith({ width: 512, height: 512 });
    expect(native.save).toHaveBeenCalledTimes(3);
    expect(native.delete).toHaveBeenCalledTimes(3);
    expect(readMarketplaceAvatarImage(data ?? '')?.bytes).toEqual(
      Uint8Array.from(Buffer.from(largeFixture, 'base64')),
    );
  });

  it('refuses a crop below 256 and leaves cancellation untouched', async () => {
    photo(400, 255);
    await expect(pickMarketplaceAvatarImage()).rejects.toBeInstanceOf(MarketplaceAvatarTooSmall);
    native.pick.mockResolvedValue({ canceled: true, assets: null });
    await expect(pickMarketplaceAvatarImage()).resolves.toBeUndefined();
    expect(native.save).not.toHaveBeenCalled();
  });

  it('re-encodes a stored Bot image without reopening the photo picker', async () => {
    const image = await prepareMarketplaceAvatarImage(
      `data:image/png;base64,${avatarFixtures.png}`,
    );
    expect(readMarketplaceAvatarImage(image)?.contentType).toBe('image/webp');
    expect(native.pick).not.toHaveBeenCalled();
  });
});
