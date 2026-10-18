// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import {
  encodeAvatar,
  BOT_AVATAR_BYTES,
  GROUP_AVATAR_BYTES,
} from '../src/client/avatar-encoding.js';

const image = (bytes: number) => `data:image/webp;base64,${Buffer.alloc(bytes).toString('base64')}`;
function canvas() {
  const value = document.createElement('canvas');
  value.width = 1024;
  value.height = 1024;
  return value;
}
afterEach(() => vi.restoreAllMocks());

it('preserves 1024px when WebP fits and includes exact decoded byte padding', () => {
  const value = canvas();
  const encoded = image(BOT_AVATAR_BYTES);
  const encode = vi.spyOn(value, 'toDataURL').mockReturnValue(encoded);
  expect(encodeAvatar(value)).toBe(encoded);
  expect(value.width).toBe(1024);
  expect(encode).toHaveBeenCalledOnce();
  expect(encode).toHaveBeenCalledWith('image/webp', 0.85);
});

it('reduces quality before resolution, and respects the stricter Group data URL cap', () => {
  const value = canvas();
  const small = image(GROUP_AVATAR_BYTES);
  const encode = vi
    .spyOn(value, 'toDataURL')
    .mockReturnValueOnce(image(GROUP_AVATAR_BYTES + 1))
    .mockReturnValue(small);
  expect(encodeAvatar(value, GROUP_AVATAR_BYTES)).toBe(small);
  expect(small.length).toBeLessThanOrEqual(131072);
  expect(encode).toHaveBeenNthCalledWith(2, 'image/webp', 0.75);
});

it('shrinks a high entropy crop when quality alone cannot fit, preserving its content', () => {
  const value = canvas();
  const drawImage = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as never);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(function (
    this: HTMLCanvasElement,
  ) {
    return image(this.width > 512 ? BOT_AVATAR_BYTES + 1 : BOT_AVATAR_BYTES);
  });
  expect(encodeAvatar(value)).toBe(image(BOT_AVATAR_BYTES));
  expect(drawImage).toHaveBeenLastCalledWith(value, 0, 0, 512, 512);
  expect(value.width).toBe(1024);
});

it('refuses unsupported canvas formats instead of returning unchecked PNG data', () => {
  const value = canvas();
  vi.spyOn(value, 'toDataURL').mockReturnValue('data:image/png;base64,AA==');
  expect(() => encodeAvatar(value)).toThrow('unsupported canvas');
});
