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

export interface ConversationStep {
  direction: -1 | 1;
  unreadOnly: boolean;
}

export function webConversationStepShortcut(
  key: string,
  keys: {
    alt: boolean;
    ctrl: boolean;
    meta: boolean;
    shift: boolean;
    altGraph?: boolean;
    composing?: boolean;
    prevented?: boolean;
  },
): ConversationStep | undefined {
  if (!keys.alt || keys.ctrl || keys.meta || keys.altGraph || keys.composing || keys.prevented)
    return undefined;
  if (key !== 'ArrowUp' && key !== 'ArrowDown') return undefined;
  return { direction: key === 'ArrowUp' ? -1 : 1, unreadOnly: keys.shift };
}

export function webConversationStepLabel(step: ConversationStep): string {
  return `Alt+${step.unreadOnly ? 'Shift+' : ''}${step.direction < 0 ? '↑' : '↓'}`;
}

export function webModalOpen(root: { querySelector(selector: string): unknown }): boolean {
  return root.querySelector(openModalSelector) !== null;
}

export function steppedConversationId(
  order: readonly string[],
  currentId: string | undefined,
  direction: -1 | 1,
  eligible: (id: string) => boolean = () => true,
): string | undefined {
  if (order.length === 0) return undefined;
  const start = currentId === undefined ? -1 : order.indexOf(currentId);
  for (let step = 1; step <= order.length; step += 1) {
    const index =
      start < 0
        ? direction > 0
          ? step - 1
          : order.length - step
        : (start + direction * step + order.length * step) % order.length;
    const id = order[index]!;
    if (id === currentId) continue;
    if (eligible(id)) return id;
  }
  return undefined;
}

const quickSwitcherBlockSelector = '[role="dialog"], [role="alertdialog"], dialog';

export function webQuickSwitcherBlocked(
  target: EventTarget | null,
  root: { querySelector(selector: string): unknown },
): boolean {
  if (
    typeof Element !== 'undefined' &&
    target instanceof Element &&
    target.closest(quickSwitcherBlockSelector) !== null
  ) {
    return true;
  }
  return root.querySelector(openModalSelector) !== null;
}

export function webQuickSwitcherShortcut(
  key: string,
  code: string,
  keys: {
    alt: boolean;
    ctrl: boolean;
    meta: boolean;
    shift: boolean;
    mac: boolean;
    altGraph?: boolean;
    composing?: boolean;
    repeat?: boolean;
    prevented?: boolean;
  },
): boolean {
  const modifier = keys.mac ? keys.meta && !keys.ctrl : keys.ctrl && !keys.meta;
  if (
    !modifier ||
    keys.alt ||
    keys.shift ||
    keys.altGraph ||
    keys.composing ||
    keys.repeat ||
    keys.prevented
  ) {
    return false;
  }
  const lower = key.toLowerCase();
  if (/^[a-z]$/u.test(lower)) return lower === 'k';
  return code === 'KeyK';
}

export function webQuickSwitcherLabel(mac: boolean): string {
  return mac ? '⌘K' : 'Ctrl+K';
}

export function isMacPlatform(navigatorLike?: {
  platform?: string;
  userAgentData?: { platform?: string } | undefined;
}): boolean {
  const source =
    navigatorLike ??
    (typeof navigator === 'undefined'
      ? undefined
      : (navigator as Navigator & { userAgentData?: { platform?: string } }));
  const platform = source?.userAgentData?.platform ?? source?.platform ?? '';
  return /mac|iphone|ipad|ipod/iu.test(platform);
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
