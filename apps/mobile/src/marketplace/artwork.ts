import {
  isPixelBannerRecipe,
  pixelBannerPixels,
  seededBannerRecipe,
} from '@botharness/pixel-banner';
import type { MarketplaceEntry } from '../../../../packages/core/src/marketplace/client';
import { avatarSvg, seededAvatarFor } from '../../../../packages/core/src/bots/avatar-appearance';

const cache = new Map<string, string>();
function cached(key: string, make: () => string) {
  const previous = cache.get(key);
  if (previous) {
    cache.delete(key);
    cache.set(key, previous);
    return previous;
  }
  const value = make();
  cache.set(key, value);
  if (cache.size > 40) cache.delete(cache.keys().next().value!);
  return value;
}
const svgUri = (svg: string) => `data:image/svg+xml;base64,${btoa(svg)}`;
export function marketplaceAvatar(bot: MarketplaceEntry) {
  const name = bot.displayName ?? bot.name;
  return cached(`avatar:${name}`, () => svgUri(avatarSvg(seededAvatarFor(name, undefined))));
}
export function botBanner(bot: {
  displayName: string;
  bannerUrl?: string;
  bannerRecipe?: { scene: string; seed: number };
}): string {
  if (bot.bannerUrl !== undefined) return bot.bannerUrl;
  return recipeBanner(
    isPixelBannerRecipe(bot.bannerRecipe) ? bot.bannerRecipe : seededBannerRecipe(bot.displayName),
  );
}

export function marketplaceBanner(bot: MarketplaceEntry, fallback = false) {
  if (!fallback && bot.banner && 'image' in bot.banner) return bot.banner.image;
  const recipe =
    bot.banner && 'recipe' in bot.banner
      ? bot.banner.recipe
      : seededBannerRecipe(bot.displayName ?? bot.name);
  return recipeBanner(recipe);
}

function recipeBanner(recipe: Parameters<typeof pixelBannerPixels>[0]): string {
  return cached(`banner:${recipe.scene}:${recipe.seed}`, () => {
    const { width, height, data } = pixelBannerPixels(recipe);
    const rectangles: string[] = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width;) {
        const start = x;
        const i = (y * width + x) * 4;
        while (++x < width) {
          const j = (y * width + x) * 4;
          if (
            data[j] !== data[i] ||
            data[j + 1] !== data[i + 1] ||
            data[j + 2] !== data[i + 2] ||
            data[j + 3] !== data[i + 3]
          )
            break;
        }
        if (data[i + 3])
          rectangles.push(
            `<rect x="${start}" y="${y}" width="${x - start}" height="1" fill="rgb(${data[i]},${data[i + 1]},${data[i + 2]})" fill-opacity="${data[i + 3]! / 255}"/>`,
          );
      }
    }
    return svgUri(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges">${rectangles.join('')}</svg>`,
    );
  });
}
