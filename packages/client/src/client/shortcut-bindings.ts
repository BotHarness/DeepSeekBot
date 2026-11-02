import { isApplePlatform, shortcutKeyLabel, shortcutKeyName } from './ds/kbd.js';
import type { ConfigStorage } from './roster-config.js';

export const SHORTCUT_BINDINGS_KEY = 'botharness.shortcuts';

export type ShortcutActionId =
  | 'bot-mode'
  | 'quick-switcher'
  | 'conversation-prev'
  | 'conversation-next'
  | 'unread-prev'
  | 'unread-next'
  | 'settings'
  | 'help';

export interface ShortcutBinding {
  readonly code: string;
  readonly mod: boolean;
  readonly alt: boolean;
  readonly shift: boolean;
}

export type ShortcutBindingMap = Readonly<Record<ShortcutActionId, ShortcutBinding>>;

export const SHORTCUT_ACTION_IDS: readonly ShortcutActionId[] = [
  'bot-mode',
  'quick-switcher',
  'conversation-prev',
  'conversation-next',
  'unread-prev',
  'unread-next',
  'settings',
  'help',
];

export const DEFAULT_SHORTCUT_BINDINGS: ShortcutBindingMap = {
  'bot-mode': { code: 'Backquote', mod: false, alt: true, shift: false },
  'quick-switcher': { code: 'KeyK', mod: false, alt: true, shift: false },
  'conversation-prev': { code: 'ArrowUp', mod: false, alt: true, shift: false },
  'conversation-next': { code: 'ArrowDown', mod: false, alt: true, shift: false },
  'unread-prev': { code: 'ArrowUp', mod: false, alt: true, shift: true },
  'unread-next': { code: 'ArrowDown', mod: false, alt: true, shift: true },
  settings: { code: 'Comma', mod: true, alt: false, shift: false },
  help: { code: 'Slash', mod: true, alt: false, shift: false },
};

export const LEGACY_QUICK_SWITCHER_BINDING: ShortcutBinding = {
  code: 'KeyK',
  mod: true,
  alt: false,
  shift: false,
};

const REPEATABLE: ReadonlySet<ShortcutActionId> = new Set([
  'conversation-prev',
  'conversation-next',
  'unread-prev',
  'unread-next',
]);

export interface ShortcutKeyboardEvent {
  readonly key: string;
  readonly code: string;
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly repeat?: boolean;
  readonly isComposing?: boolean;
  readonly defaultPrevented?: boolean;
  getModifierState?(key: string): boolean;
}

const MODIFIER_CODE = /^(?:Shift|Control|Alt|Meta|OS|CapsLock|Fn)/u;

export function shortcutEventCode(event: Pick<ShortcutKeyboardEvent, 'key' | 'code'>): string {
  const lower = event.key.toLowerCase();
  return /^[a-z]$/u.test(lower) ? `Key${lower.toUpperCase()}` : event.code;
}

export function isModifierOnly(event: Pick<ShortcutKeyboardEvent, 'code'>): boolean {
  return MODIFIER_CODE.test(event.code);
}

export function bindingFromEvent(
  event: ShortcutKeyboardEvent,
  mac: boolean,
): ShortcutBinding | undefined {
  if (isModifierOnly(event) || event.getModifierState?.('AltGraph') === true) return undefined;
  if (mac ? event.ctrlKey : event.metaKey) return undefined;
  return {
    code: shortcutEventCode(event),
    mod: mac ? event.metaKey : event.ctrlKey,
    alt: event.altKey,
    shift: event.shiftKey,
  };
}

export function bindingMatches(
  binding: ShortcutBinding,
  event: ShortcutKeyboardEvent,
  mac: boolean,
  allowRepeat = false,
): boolean {
  if (event.isComposing === true || event.defaultPrevented === true) return false;
  if (event.repeat === true && !allowRepeat) return false;
  const pressed = bindingFromEvent(event, mac);
  return pressed !== undefined && sameBinding(pressed, binding);
}

export function sameBinding(a: ShortcutBinding, b: ShortcutBinding): boolean {
  return a.code === b.code && a.mod === b.mod && a.alt === b.alt && a.shift === b.shift;
}

const CODE_LABELS: Readonly<Record<string, string>> = {
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Space: 'Space',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Escape: 'Esc',
};

export function shortcutCodeLabel(code: string): string {
  const named = CODE_LABELS[code];
  if (named !== undefined) return named;
  const match = /^(?:Key|Digit|Numpad)(.+)$/u.exec(code);
  return match === null ? code : match[1]!;
}

export function bindingKeys(binding: ShortcutBinding): string[] {
  return [
    ...(binding.mod ? ['Mod'] : []),
    ...(binding.alt ? ['Alt'] : []),
    ...(binding.shift ? ['Shift'] : []),
    shortcutCodeLabel(binding.code),
  ];
}

export function bindingText(binding: ShortcutBinding, mac: boolean): string {
  const keys = bindingKeys(binding);
  return mac
    ? keys.map((key) => shortcutKeyLabel(key, true)).join('')
    : keys.map((key) => shortcutKeyName(key, false)).join('+');
}

const RESERVED_MOD_CODES = new Set([
  'KeyA',
  'KeyC',
  'KeyF',
  'KeyV',
  'KeyX',
  'KeyY',
  'KeyZ',
  'KeyL',
  'KeyN',
  'KeyQ',
  'KeyR',
  'KeyT',
  'KeyW',
]);
const RESERVED_CODES = new Set(['Enter', 'NumpadEnter', 'Tab', 'Escape', 'Backspace']);

export type ShortcutBindingProblem =
  | { readonly kind: 'needs-modifier' }
  | { readonly kind: 'reserved' }
  | { readonly kind: 'conflict'; readonly action: ShortcutActionId };

export function shortcutBindingProblem(
  bindings: ShortcutBindingMap,
  action: ShortcutActionId,
  binding: ShortcutBinding,
): ShortcutBindingProblem | undefined {
  if (!binding.mod && !binding.alt) return { kind: 'needs-modifier' };
  if (RESERVED_CODES.has(binding.code)) return { kind: 'reserved' };
  if (binding.alt && !binding.mod && !binding.shift && /^Digit\d$/u.test(binding.code))
    return { kind: 'reserved' };
  if (binding.mod && !binding.alt && RESERVED_MOD_CODES.has(binding.code))
    return { kind: 'reserved' };
  const owner = SHORTCUT_ACTION_IDS.find(
    (candidate) => candidate !== action && sameBinding(bindings[candidate], binding),
  );
  return owner === undefined ? undefined : { kind: 'conflict', action: owner };
}

function isBinding(value: unknown): value is ShortcutBinding {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.code === 'string' &&
    record.code.length > 0 &&
    typeof record.mod === 'boolean' &&
    typeof record.alt === 'boolean' &&
    typeof record.shift === 'boolean'
  );
}

export function parseShortcutBindings(raw: string | null | undefined): ShortcutBindingMap {
  let custom: Record<string, unknown> = {};
  try {
    const parsed: unknown = raw === null || raw === undefined ? {} : JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null) custom = parsed as Record<string, unknown>;
  } catch {}
  const result: Record<ShortcutActionId, ShortcutBinding> = { ...DEFAULT_SHORTCUT_BINDINGS };
  for (const action of SHORTCUT_ACTION_IDS) {
    const value = custom[action];
    if (!isBinding(value)) continue;
    const binding = { code: value.code, mod: value.mod, alt: value.alt, shift: value.shift };
    if (shortcutBindingProblem(result, action, binding) === undefined) result[action] = binding;
  }
  return result;
}

export class ShortcutBindings {
  #bindings: ShortcutBindingMap;
  readonly #listeners = new Set<() => void>();
  readonly #storage: ConfigStorage | undefined;
  readonly mac: () => boolean;

  constructor(storage: ConfigStorage | undefined, mac: () => boolean = () => isApplePlatform()) {
    this.#storage = storage;
    this.mac = mac;
    let raw: string | null = null;
    try {
      raw = storage?.getItem(SHORTCUT_BINDINGS_KEY) ?? null;
    } catch {}
    this.#bindings = parseShortcutBindings(raw);
  }

  readonly getSnapshot = (): ShortcutBindingMap => this.#bindings;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  binding(action: ShortcutActionId): ShortcutBinding {
    return this.#bindings[action];
  }

  isCustom(action: ShortcutActionId): boolean {
    return !sameBinding(this.#bindings[action], DEFAULT_SHORTCUT_BINDINGS[action]);
  }

  matches(action: ShortcutActionId, event: ShortcutKeyboardEvent): boolean {
    if (bindingMatches(this.#bindings[action], event, this.mac(), REPEATABLE.has(action)))
      return true;
    return (
      action === 'quick-switcher' &&
      !this.isCustom(action) &&
      !SHORTCUT_ACTION_IDS.some((other) =>
        sameBinding(this.#bindings[other], LEGACY_QUICK_SWITCHER_BINDING),
      ) &&
      bindingMatches(LEGACY_QUICK_SWITCHER_BINDING, event, this.mac())
    );
  }

  text(action: ShortcutActionId): string {
    return bindingText(this.#bindings[action], this.mac());
  }

  set(action: ShortcutActionId, binding: ShortcutBinding): ShortcutBindingProblem | undefined {
    const problem = shortcutBindingProblem(this.#bindings, action, binding);
    if (problem !== undefined) return problem;
    this.#commit({ ...this.#bindings, [action]: binding });
    return undefined;
  }

  reset(action: ShortcutActionId): ShortcutBindingProblem | undefined {
    return this.set(action, DEFAULT_SHORTCUT_BINDINGS[action]);
  }

  #commit(next: ShortcutBindingMap): void {
    this.#bindings = next;
    const custom: Partial<Record<ShortcutActionId, ShortcutBinding>> = {};
    for (const action of SHORTCUT_ACTION_IDS)
      if (this.isCustom(action)) custom[action] = next[action];
    try {
      this.#storage?.setItem(SHORTCUT_BINDINGS_KEY, JSON.stringify(custom));
    } catch {}
    for (const listener of this.#listeners) listener();
  }
}
