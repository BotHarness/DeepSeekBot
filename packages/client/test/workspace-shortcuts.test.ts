import { describe, expect, it, vi } from 'vitest';
import type { ShortcutCommand } from '@deepseek-ai/dsh-client-shortcuts/client';
import {
  effectiveShortcuts,
  normalizeBinding,
  isWebBindingAllowed,
  bindingIssue,
  parseShortcutDefinitions,
} from '@deepseek-ai/dsh-client-shortcuts/protocol';
import { createDockPanelRegistry } from '../src/client/dock-panels.js';
import {
  migrateWorkShortcut,
  registerWorkspaceShortcuts,
  workspaceShortcutId,
} from '../src/client/workspace-shortcuts.js';
import { zhTranslate } from '../src/client/locale.js';

describe('workspace shortcut ownership', () => {
  it('uses valid native command identities/defaults and routes only while its workspace owns the layout', () => {
    const commands = new Map<string, ShortcutCommand>();
    const register = (command: ShortcutCommand) => {
      parseShortcutDefinitions([{ id: command.id, defaults: command.defaults }]);
      for (const [profile, binding] of Object.entries(command.defaults)) {
        const [runtime, platform] = profile.split(':') as [
          'desktop' | 'web',
          'macos' | 'windows' | 'linux',
        ];
        const normalized = normalizeBinding(binding!, platform);
        expect(bindingIssue(normalized, runtime, platform)).toBeNull();
        if (runtime === 'web') expect(isWebBindingAllowed(normalized, platform)).toBe(true);
      }
      commands.set(command.id, command);
      return () => {
        commands.delete(command.id);
      };
    };
    const registry = createDockPanelRegistry();
    for (const id of [
      'bh:home',
      'botharness-browser',
      'botharness-computer',
      'memory-files',
      'memory-evolution',
      'schedules',
    ])
      registry.register({ id, title: id, scope: 'global', component: () => null });
    let active = false;
    const dispose = registerWorkspaceShortcuts({ register }, registry, () => active, zhTranslate);
    expect(
      commands.get(workspaceShortcutId('botharness-browser'))?.defaults['desktop:macos']?.code,
    ).toBe('KeyB');
    expect(
      commands.get(workspaceShortcutId('botharness-computer'))?.defaults['desktop:macos']?.code,
    ).toBe('Digit0');
    for (const [id, code] of [
      ['bh:home', 'KeyH'],
      ['memory-files', 'Digit6'],
      ['memory-evolution', 'KeyE'],
      ['schedules', 'Digit9'],
    ]) {
      expect(commands.get(workspaceShortcutId(id!))?.defaults['desktop:macos']?.code).toBe(code);
    }
    const open = vi.fn();
    registry.attach({ open, close: vi.fn() });
    const command = commands.get(workspaceShortcutId('bh:channel-body'))!;
    expect(command.label()).toContain('消息');
    expect(command.label()).not.toContain('workspace.messages');
    const context = { region: 'editable' as const, modal: null, target: null };
    expect(command.resolve(context)).toEqual({ status: 'pass' });
    active = true;
    const result = command.resolve(context);
    expect(result.status).toBe('handled');
    if (result.status === 'handled') result.run();
    expect(open).toHaveBeenCalledWith('bh:channel-body');
    expect(command.resolve({ ...context, modal: 'settings' })).toEqual({ status: 'pass' });
    registry.attach({ open, close: vi.fn(), canOpen: (id) => id !== 'botharness-browser' });
    expect(commands.get(workspaceShortcutId('botharness-browser'))!.resolve(context)).toEqual({
      status: 'pass',
    });
    expect(command.resolve(context).status).toBe('handled');
    const remove = registry.register({
      id: 'custom:inbox',
      title: 'Custom',
      scope: 'global',
      component: () => null,
    });
    expect(commands.has(workspaceShortcutId('custom:inbox'))).toBe(true);
    remove();
    expect(commands.has(workspaceShortcutId('custom:inbox'))).toBe(false);
    expect(commands.has(workspaceShortcutId('bh:channels'))).toBe(true);
    dispose();
    expect(commands.size).toBe(0);
  });
});

describe('Home native shortcut preferences', () => {
  it('preserves custom bindings, explicit unbinding and conflicts without renumbering panels', () => {
    const commands: ShortcutCommand[] = [];
    const registry = createDockPanelRegistry();
    registry.register({ id: 'bh:home', title: 'Home', scope: 'global', component: () => null });
    const dispose = registerWorkspaceShortcuts(
      {
        register: (command) => {
          commands.push(command);
          return () => {};
        },
      },
      registry,
      () => true,
      zhTranslate,
    );
    const homeId = workspaceShortcutId('bh:home');
    const messagesId = workspaceShortcutId('bh:channel-body');
    const binding = { code: 'KeyJ', modifiers: ['meta', 'alt', 'shift'] as const };
    const resolve = (overrides: Record<string, typeof binding | null>) =>
      effectiveShortcuts(
        commands,
        { schemaVersion: 2, profiles: { 'desktop:macos': overrides } },
        'desktop',
        'macos',
      );
    expect(resolve({ [homeId]: binding }).find((x) => x.id === homeId)).toMatchObject({
      modified: true,
      binding: { code: 'KeyJ' },
      conflicts: [],
    });
    expect(resolve({ [homeId]: null }).find((x) => x.id === homeId)).toMatchObject({
      binding: null,
      modified: true,
    });
    const conflicts = resolve({ [homeId]: binding, [messagesId]: binding });
    expect(conflicts.find((x) => x.id === homeId)?.conflicts).toContain(messagesId);
    expect(conflicts.find((x) => x.id === messagesId)?.conflicts).toContain(homeId);
    expect(commands.find((x) => x.id === messagesId)?.defaults['desktop:macos']?.code).toBe(
      'Digit2',
    );
    dispose();
  });
});

describe('legacy Work shortcut migration', () => {
  const old = workspaceShortcutId('group-work');
  const next = workspaceShortcutId('sessions');
  const binding = { code: 'KeyJ', modifiers: ['meta', 'shift'] };
  function fixture(overrides: Record<string, unknown>, conflict = false) {
    let profile = { ...overrides };
    let revision = 0;
    const listeners = new Set<() => void>();
    const getSnapshot = () => ({
      status: 'ready',
      revision: String(revision),
      document: { schemaVersion: 2, profiles: { 'desktop:macos': profile } },
    });
    const subscribe = (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    };
    const edits: unknown[] = [];
    const api = {
      runtime: 'desktop',
      platform: 'macos',
      config: { getSnapshot, subscribe },
      catalog: { getSnapshot: () => [{ id: next }], subscribe },
      describeBinding: () => ({ issue: null, conflicts: conflict ? ['other-command'] : [] }),
      edit: async (edit: { type: string; id: string; binding?: unknown }) => {
        edits.push(edit);
        profile = { ...profile };
        if (edit.type === 'reset') delete profile[edit.id];
        else profile[edit.id] = edit.binding;
        revision++;
        listeners.forEach((listener) => listener());
        return { status: 'saved', snapshot: getSnapshot() };
      },
    };
    return {
      api: api as unknown as Parameters<typeof migrateWorkShortcut>[0],
      edits,
      profile: () => profile,
    };
  }
  async function settle() {
    for (let i = 0; i < 8; i++) await Promise.resolve();
  }
  it('uses accepted native edits to move a custom binding, once', async () => {
    const f = fixture({ [old]: binding });
    const notice = vi.fn();
    const dispose = migrateWorkShortcut(f.api, notice);
    await settle();
    expect(f.profile()).toEqual({ [old]: binding, [next]: binding });
    expect(f.edits).toHaveLength(1);
    expect(notice).not.toHaveBeenCalled();
    dispose();
    const again = migrateWorkShortcut(f.api, notice);
    await settle();
    expect(f.edits).toHaveLength(1);
    again();
  });
  it('retries native definition readiness without showing a false migration warning', async () => {
    vi.useFakeTimers();
    const f = fixture({ [old]: binding });
    const original = f.api.edit;
    const edit = vi
      .spyOn(f.api, 'edit')
      .mockResolvedValueOnce({ status: 'not-ready', snapshot: f.api.config.getSnapshot() });
    edit.mockImplementation(original);
    edit.mockResolvedValueOnce({ status: 'not-ready', snapshot: f.api.config.getSnapshot() });
    const notice = vi.fn();
    const dispose = migrateWorkShortcut(f.api, notice);
    try {
      await settle();
      expect(notice).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(500);
      expect(f.profile()[next]).toEqual(binding);
      expect(notice).not.toHaveBeenCalled();
    } finally {
      dispose();
      vi.useRealTimers();
    }
  });
  it('preserves explicit Sessions unbinding and keeps the retired override dormant', async () => {
    const f = fixture({ [old]: binding, [next]: null });
    const notice = vi.fn();
    const dispose = migrateWorkShortcut(f.api, notice);
    await settle();
    expect(f.profile()).toEqual({ [old]: binding, [next]: null });
    expect(notice).toHaveBeenCalledTimes(1);
    dispose();
  });
  it('refuses a conflict without changing any accepted binding', async () => {
    const f = fixture({ [old]: binding }, true);
    const notice = vi.fn();
    const dispose = migrateWorkShortcut(f.api, notice);
    await settle();
    expect(f.edits).toEqual([]);
    expect(f.profile()[old]).toEqual(binding);
    expect(notice).toHaveBeenCalledTimes(1);
    dispose();
  });
  it('does not turn a Work unbinding into a Sessions unbinding', async () => {
    const f = fixture({ [old]: null });
    const dispose = migrateWorkShortcut(f.api, vi.fn());
    await settle();
    expect(f.profile()).toEqual({ [old]: null });
    dispose();
  });
});
