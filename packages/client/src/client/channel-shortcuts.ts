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

export function webShortcutHelpQuestion(
  key: string,
  keys: {
    ctrl: boolean;
    meta: boolean;
    alt: boolean;
    altGraph?: boolean;
    composing?: boolean;
    repeat?: boolean;
    prevented?: boolean;
  },
): boolean {
  return (
    key === '?' &&
    !keys.ctrl &&
    !keys.meta &&
    !keys.alt &&
    !keys.altGraph &&
    !keys.composing &&
    !keys.repeat &&
    !keys.prevented
  );
}
