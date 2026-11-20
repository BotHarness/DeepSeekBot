import { blobatar } from 'blobatar';
import type { CSSProperties, ReactElement } from 'react';

import type { BotModeIcon } from '@botharness/host-client/shared/bot-mode-settings';
import {
  DEEPSEEKBOT_DARK_DATA_URI,
  DEEPSEEKBOT_LIGHT_DATA_URI,
  DEEPSEEKBOT_SIMPLE_DARK_DATA_URI,
  DEEPSEEKBOT_SIMPLE_LIGHT_DATA_URI,
  DEEPSEEKBOT_SIMPLE_TRANSPARENT_DATA_URI,
  DEEPSEEKBOT_TRANSPARENT_DATA_URI,
} from './bot-icon-assets.js';
import { useBotColorScheme, type BotColorScheme } from './bot-color-scheme.js';

export const BOT_BLOB_SEED = 'botharness:bot';

export const BOT_GLYPH_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/>' +
  '<path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>';

export function botIconMarkup(icon: BotModeIcon, scheme: BotColorScheme): string {
  if (icon === 'mascot' || icon === 'simple') {
    const simple = icon === 'simple';
    const source = simple
      ? scheme === 'dark'
        ? DEEPSEEKBOT_SIMPLE_DARK_DATA_URI
        : DEEPSEEKBOT_SIMPLE_LIGHT_DATA_URI
      : scheme === 'dark'
        ? DEEPSEEKBOT_DARK_DATA_URI
        : DEEPSEEKBOT_LIGHT_DATA_URI;
    return `<img src="${source}" alt="" draggable="false" />`;
  }
  if (icon === 'blob') {
    try {
      return blobatar(BOT_BLOB_SEED);
    } catch {
      return BOT_GLYPH_SVG;
    }
  }
  return BOT_GLYPH_SVG;
}

export function botBackdropUri(icon: BotModeIcon): string {
  return icon === 'simple'
    ? DEEPSEEKBOT_SIMPLE_TRANSPARENT_DATA_URI
    : DEEPSEEKBOT_TRANSPARENT_DATA_URI;
}

export function BotIcon({
  icon,
  size,
  className,
}: {
  readonly icon: BotModeIcon;
  readonly size: number;
  readonly className?: string | undefined;
}): ReactElement {
  const scheme = useBotColorScheme();
  return (
    <span
      className={className === undefined ? 'bh-bot-icon' : `bh-bot-icon ${className}`}
      style={{ '--bh-bot-icon-size': `${String(size)}px` } as CSSProperties}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: botIconMarkup(icon, scheme) }}
    />
  );
}
