const shortcutTargetSelector =
  'input, textarea, select, [contenteditable], [role="dialog"], [role="alertdialog"], dialog';
const openModalSelector =
  '[role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"], dialog[open]';

export function webShortcutBlocked(
  target: EventTarget | null,
  root: { querySelector(selector: string): unknown },
): boolean {
  if (
    typeof Element !== 'undefined' &&
    target instanceof Element &&
    target.closest(shortcutTargetSelector) !== null
  ) {
    return true;
  }
  return root.querySelector(openModalSelector) !== null;
}

export function webChannelShortcutIndex(
  code: string,
  keys: {
    alt: boolean;
    ctrl: boolean;
    meta: boolean;
    shift: boolean;
    altGraph?: boolean;
    composing?: boolean;
    repeat?: boolean;
    prevented?: boolean;
  },
): number | undefined {
  if (
    !keys.alt ||
    keys.ctrl ||
    keys.meta ||
    keys.shift ||
    keys.altGraph ||
    keys.composing ||
    keys.repeat ||
    keys.prevented
  ) {
    return undefined;
  }
  const match = /^Digit([0-9])$/u.exec(code);
  if (match === null) return undefined;
  return match[1] === '0' ? 9 : Number(match[1]) - 1;
}

export function webChannelShortcutLabel(index: number): string | undefined {
  if (!Number.isInteger(index) || index < 0 || index > 9) return undefined;
  return `Alt+${index === 9 ? 0 : index + 1}`;
}

export function webBotModeShortcut(
  code: string,
  keys: {
    alt: boolean;
    ctrl: boolean;
    meta: boolean;
    shift: boolean;
    altGraph?: boolean;
    composing?: boolean;
    repeat?: boolean;
    prevented?: boolean;
  },
): boolean {
  return (
    code === 'Backquote' &&
    keys.alt &&
    !keys.ctrl &&
    !keys.meta &&
    !keys.shift &&
    !keys.altGraph &&
    !keys.composing &&
    !keys.repeat &&
    !keys.prevented
  );
}

export type ShortcutHelpTrigger = 'question' | 'slash';

export function webShortcutHelpShortcut(
  event: { key: string; code: string },
  keys: {
    alt: boolean;
    ctrl: boolean;
    meta: boolean;
    shift: boolean;
    altGraph?: boolean;
    composing?: boolean;
    repeat?: boolean;
    prevented?: boolean;
  },
): ShortcutHelpTrigger | undefined {
  if (keys.alt || keys.altGraph || keys.composing || keys.repeat || keys.prevented)
    return undefined;
  if (event.code === 'Slash' && (keys.ctrl || keys.meta) && !keys.shift) return 'slash';
  if (event.key === '?' && !keys.ctrl && !keys.meta) return 'question';
  return undefined;
}

export function webShortcutBlockedByModal(root: {
  querySelector(selector: string): unknown;
}): boolean {
  return root.querySelector(openModalSelector) !== null;
}
