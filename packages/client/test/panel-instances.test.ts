import { describe, expect, it } from 'vitest';
import {
  createDockPanelRegistry,
  type DockPanelInstance,
  type DockPanelProps,
} from '../src/client/dock-panels.js';
const definition = {
  id: 'avatar',
  title: 'Character',
  scope: 'channel' as const,
  binding: 'current-bot' as const,
  component: () => null,
};
describe('ordinary Panel instances', () => {
  it('persists fixed A/B bindings, restores after plugin reload, and distinguishes close from deletion', () => {
    let saved: readonly DockPanelInstance[] = [];
    const registry = createDockPanelRegistry({
      saveInstances: (value) => {
        saved = value;
      },
    });
    const off = registry.register(definition);
    const a = registry.createInstance('avatar', 'a', 'Alice');
    const b = registry.createInstance('avatar', 'b', 'Bob');
    registry.close(a);
    expect(saved.map((value) => value.botId)).toEqual(['a', 'b']);
    expect(registry.panels().find((p) => p.id === b)).toMatchObject({
      scope: 'global',
      title: 'Character · Bob',
      binding: undefined,
    });
    off();
    expect(registry.panels()).toEqual([]);
    registry.register(definition);
    off();
    expect(registry.panels()).toHaveLength(3);
    registry.removeInstance(a);
    expect(saved.map((value) => value.id)).toEqual([b]);
    const restored = createDockPanelRegistry({ instances: saved });
    restored.register(definition);
    expect(restored.panels().map((value) => value.id)).toContain(b);
  });
  it('does not create a transient instance when layout persistence refuses a write', () => {
    const registry = createDockPanelRegistry({
      saveInstances: () => {
        throw new Error('read_only');
      },
    });
    registry.register(definition);
    expect(() => registry.createInstance('avatar', 'a', 'Alice')).toThrow('read_only');
    expect(registry.instances()).toEqual([]);
    expect(registry.panels()).toHaveLength(1);
  });
  it('binds a header action to the fixed instance it belongs to', () => {
    const registry = createDockPanelRegistry();
    const headerAction = (props: DockPanelProps) => props;
    registry.register({ ...definition, headerAction: headerAction as never });
    const a = registry.createInstance('avatar', 'a', 'Alice');
    const panel = registry.panels().find((p) => p.id === a)!;
    const element = (
      panel.headerAction as (props: DockPanelProps) => {
        props: DockPanelProps;
      }
    )({ channel: undefined });
    expect(element.props).toMatchObject({ botId: 'a', instanceId: a });
  });
});
