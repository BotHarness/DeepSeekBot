import type { ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';

import { border, color, radius, space, text } from './tokens.stylex.js';

export type ShortcutKey = string;

const KEY_NAMES: Readonly<Record<string, string>> = {
  Mod: 'Ctrl',
  Shift: 'Shift',
  Enter: 'Enter',
  Alt: 'Alt',
};

export interface PlatformSource {
  platform?: string;
  userAgentData?: { platform?: string } | undefined;
}

export function isApplePlatform(source?: PlatformSource): boolean {
  const resolved =
    source ??
    (typeof navigator === 'undefined' ? undefined : (navigator as Navigator & PlatformSource));
  const platform = resolved?.userAgentData?.platform ?? resolved?.platform ?? '';
  return /mac|iphone|ipad|ipod/iu.test(platform);
}

export function shortcutKeyLabel(key: ShortcutKey, apple: boolean): string {
  if (key === 'Mod') return apple ? '⌘' : 'Ctrl';
  if (key === 'Alt') return apple ? '⌥' : 'Alt';
  if (key === 'Shift') return '⇧';
  if (key === 'Enter') return '↵';
  return key;
}

export function shortcutKeyName(key: ShortcutKey, apple: boolean): string {
  if (key === 'Mod' && apple) return 'Command';
  if (key === 'Alt' && apple) return 'Option';
  return KEY_NAMES[key] ?? key;
}

const styles = stylex.create({
  combo: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: space.x1,
    verticalAlign: 'middle',
  },
  kbd: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '22px',
    height: '22px',
    paddingInline: space.x2,
    borderWidth: border.hairline,
    borderStyle: 'solid',
    borderColor: color.border,
    borderRadius: radius.xs,
    backgroundColor: color.elevated,
    color: color.fg,
    fontFamily: 'inherit',
    fontSize: text.metaSize,
    lineHeight: 1,
    whiteSpace: 'nowrap',
  },
});

export function Kbd({
  shortcutKey,
  apple = isApplePlatform(),
}: {
  shortcutKey: ShortcutKey;
  apple?: boolean;
}): ReactElement {
  return (
    <kbd title={shortcutKeyName(shortcutKey, apple)} {...stylex.props(styles.kbd)}>
      {shortcutKeyLabel(shortcutKey, apple)}
    </kbd>
  );
}

export function KeyCombo({
  keys,
  apple = isApplePlatform(),
}: {
  keys: readonly ShortcutKey[];
  apple?: boolean;
}): ReactElement {
  return (
    <span data-key-combo={keys.join('+')} {...stylex.props(styles.combo)}>
      {keys.map((key) => (
        <Kbd key={key} shortcutKey={key} apple={apple} />
      ))}
    </span>
  );
}
