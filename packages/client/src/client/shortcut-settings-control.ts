import {
  ClientSettingsError,
  settingsRevision,
  type ClientSettingsDomain,
} from './client-settings-control.js';
import {
  DEFAULT_SHORTCUT_BINDINGS,
  RESERVED_CODES,
  RESERVED_MOD_CODES,
  SHORTCUT_ACTION_IDS,
  bindingText,
  isModifierOnly,
  sameBinding,
  shortcutBindingProblem,
  type ShortcutActionId,
  type ShortcutBinding,
  type ShortcutBindingMap,
  type ShortcutBindingProblem,
  type ShortcutBindings,
} from './shortcut-bindings.js';

export interface ShortcutSettingsSnapshot {
  readonly revision: string;
  readonly platform: 'mac' | 'other';
  readonly actions: readonly {
    readonly id: ShortcutActionId;
    readonly binding: ShortcutBinding | null;
    readonly default: ShortcutBinding;
    readonly custom: boolean;
    readonly text: string | null;
  }[];
  readonly reserved: { readonly modCodes: readonly string[]; readonly codes: readonly string[] };
}

type ShortcutPatch =
  | { readonly action: ShortcutActionId; readonly binding: ShortcutBinding | null }
  | { readonly action: ShortcutActionId; readonly reset: true };

const BINDING_KEYS = ['alt', 'code', 'mod', 'shift'];

function invalid(): ClientSettingsError {
  return new ClientSettingsError('client-settings-invalid-input');
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function parseBinding(value: unknown): ShortcutBinding | null {
  if (value === null) return null;
  const input = record(value);
  if (input === undefined || Object.keys(input).sort().join() !== BINDING_KEYS.join())
    throw invalid();
  const { code, mod, alt, shift } = input;
  if (
    typeof code !== 'string' ||
    !/^[A-Za-z][A-Za-z0-9]{0,31}$/u.test(code) ||
    isModifierOnly({ code }) ||
    typeof mod !== 'boolean' ||
    typeof alt !== 'boolean' ||
    typeof shift !== 'boolean'
  )
    throw invalid();
  return { code, mod, alt, shift };
}

function parsePatch(value: unknown): ShortcutPatch {
  const input = record(value);
  if (input === undefined || typeof input.action !== 'string') throw invalid();
  const keys = Object.keys(input).sort().join();
  if (keys !== 'action,binding' && !(keys === 'action,reset' && input.reset === true))
    throw invalid();
  const action = input.action;
  const binding = keys === 'action,binding' ? parseBinding(input.binding) : undefined;
  if (!SHORTCUT_ACTION_IDS.includes(action as ShortcutActionId))
    throw new ClientSettingsError('shortcut-action-unknown');
  return binding === undefined
    ? { action: action as ShortcutActionId, reset: true }
    : { action: action as ShortcutActionId, binding };
}

function refusal(problem: ShortcutBindingProblem): ClientSettingsError {
  return problem.kind === 'conflict'
    ? new ClientSettingsError('shortcut-conflict', `shortcut-conflict: ${problem.action}`)
    : new ClientSettingsError(`shortcut-${problem.kind}`);
}

function snapshot(map: ShortcutBindingMap, mac: boolean): ShortcutSettingsSnapshot {
  return {
    revision: settingsRevision(map),
    platform: mac ? 'mac' : 'other',
    actions: SHORTCUT_ACTION_IDS.map((id) => {
      const binding = map[id];
      const fallback = DEFAULT_SHORTCUT_BINDINGS[id];
      return {
        id,
        binding,
        default: fallback,
        custom: binding === null || !sameBinding(binding, fallback),
        text: binding === null ? null : bindingText(binding, mac),
      };
    }),
    reserved: { modCodes: [...RESERVED_MOD_CODES].sort(), codes: [...RESERVED_CODES].sort() },
  };
}

export function shortcutSettingsDomain(bindings: ShortcutBindings): ClientSettingsDomain {
  const read = (): ShortcutSettingsSnapshot => snapshot(bindings.refresh(), bindings.mac());
  return {
    read,
    write(raw, { expectedRevision, assertLive }) {
      const patch = parsePatch(raw);
      const current = bindings.refresh();
      if (settingsRevision(current) !== expectedRevision)
        throw new ClientSettingsError('client-settings-revision-conflict');
      const next = 'reset' in patch ? DEFAULT_SHORTCUT_BINDINGS[patch.action] : patch.binding;
      const problem =
        next === null ? undefined : shortcutBindingProblem(current, patch.action, next);
      if (problem !== undefined) throw refusal(problem);
      assertLive();
      const committed = bindings.set(patch.action, next);
      if (committed !== undefined) throw refusal(committed);
      const saved = bindings.refresh()[patch.action];
      if (saved === null ? next !== null : next === null || !sameBinding(saved, next))
        throw new ClientSettingsError('client-settings-storage-unavailable');
      return read();
    },
  };
}
