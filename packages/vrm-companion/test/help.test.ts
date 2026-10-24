import { describe, expect, it, vi } from 'vitest';
import type { DockPanelProps, HelpStep } from '@botharness/ui/panels';
import { createDockPanelRegistry } from '../../client/src/client/dock-panels.js';
import { createHelpService } from '../../client/src/client/help-service.js';
import { PanelControls } from '../src/client/controls.js';
import { createVrmHelp } from '../src/client/help.js';

const QUESTION = 'vrm:change-camera';
const PANEL = 'botharness-vrm';

function element() {
  const state = { connected: true, visible: true, expanded: false };
  const node = {
    get isConnected() {
      return state.connected;
    },
    getClientRects: () => (state.visible ? [{}] : []),
    getAttribute: (name: string) => (name === 'aria-expanded' ? String(state.expanded) : null),
    querySelector: (selector: string) => (selector === '[data-vrm-scene-menu]' ? node : null),
  } as unknown as Element;
  return { node, state };
}

function fixture(late = false) {
  const panels = createDockPanelRegistry();
  panels.register({
    id: PANEL,
    title: 'VRM',
    scope: 'channel',
    binding: 'current-bot',
    component: () => null,
  });
  let steps: readonly HelpStep[] = [];
  const presentationDispose = vi.fn();
  const help = createHelpService((value) => {
    steps = value;
    return presentationDispose;
  });
  let activeHelp = late ? undefined : help;
  const lessons = createVrmHelp(panels, () => activeHelp);
  const connect = () => {
    activeHelp = help;
    return help.register(lessons.contribution);
  };
  const release = late ? () => {} : connect();
  const opened = new Set<string>();
  function target(botId: string, instanceId?: string, channelId = 'dm:' + botId) {
    const props: DockPanelProps = {
      channel: { id: channelId, type: 'dm', botSlug: botId },
      instanceId,
    };
    const root = element();
    const header = element();
    const controls = new PanelControls(botId);
    controls.set({ camera: 'desk', scene: { phase: 'seated', wandering: false, ready: true } });
    const unsubscribe = vi.fn();
    const listeners = new Set<() => void>();
    const tracked = {
      read: controls.read,
      subscribe(listener: () => void) {
        listeners.add(listener);
        const stop = controls.subscribe(listener);
        return () => {
          listeners.delete(listener);
          stop();
          unsubscribe();
        };
      },
    };
    const unmount = lessons.mount(props, botId, root.node, tracked);
    const unheader = lessons.header(props, botId, header.node);
    opened.add(instanceId ?? PANEL);
    panels.reportOpen([...opened]);
    const available = guide.availability();
    const candidates =
      available.status === 'ready'
        ? [available.target]
        : available.status === 'select'
          ? available.targets
          : [];
    const id = candidates.at(-1)!.id;
    return {
      id,
      props,
      root,
      header,
      controls,
      tracked,
      unmount,
      unheader,
      listeners,
      unsubscribe,
    };
  }
  const pin = (botId: string) => panels.createInstance(PANEL, botId, botId);
  const guide = lessons.contribution.topics[0]!.questions[1]!.guide!;
  return {
    panels,
    help,
    lessons,
    target,
    pin,
    release,
    guide,
    steps: () => steps,
    presentationDispose,
    connect,
  };
}

describe('independent VRM real-instance camera guide', () => {
  it('updates idle readiness without publishing camera frames as catalog changes', () => {
    const test = fixture();
    const selected = test.target('ready-state');
    const readyTopics = test.help.topics();
    selected.controls.camera('portrait');
    expect(test.help.topics()).toBe(readyTopics);
    selected.controls.set({ scene: { phase: 'seated', wandering: false, ready: false } });
    expect(test.help.topics()).not.toBe(readyTopics);
    expect(test.help.availability(QUESTION).status).toBe('unavailable');
    const waitingTopics = test.help.topics();
    selected.controls.set({ scene: { phase: 'seated', wandering: false, ready: true } });
    expect(test.help.topics()).not.toBe(waitingTopics);
    expect(test.help.availability(QUESTION).status).toBe('ready');
    test.lessons.dispose();
    expect(selected.listeners.size).toBe(0);
  });
  it('requires an already mounted, visible, ready target, not retained controls', () => {
    const test = fixture();
    const controls = new PanelControls('cached');
    Object.defineProperty(controls, 'stage', { value: {} });
    controls.set({ scene: { phase: 'seated', wandering: false, ready: true } });
    expect(test.help.availability(QUESTION).status).toBe('unavailable');
    const target = test.target('visible');
    expect(test.help.availability(QUESTION).status).toBe('ready');
    target.root.state.visible = false;
    expect(test.help.availability(QUESTION).status).toBe('unavailable');
    target.root.state.visible = true;
    target.controls.set({ scene: { phase: 'seated', wandering: false, ready: false } });
    expect(test.help.availability(QUESTION).status).toBe('unavailable');
    test.lessons.dispose();
  });

  it('enumerates contextual and multiple same-Bot pins; requires explicit selection', async () => {
    const test = fixture();
    const context = test.target('same');
    const first = test.target('same', test.pin('same'));
    const second = test.target('same', test.pin('same'));
    const other = test.target('other', test.pin('other'));
    const availability = test.help.availability(QUESTION);
    expect(availability.status).toBe('select');
    if (availability.status !== 'select') throw new Error('selection expected');
    expect(availability.targets.map((item) => item.id)).toEqual([
      context.id,
      first.id,
      second.id,
      other.id,
    ]);
    expect(new Set(availability.targets.map((item) => item.label)).size).toBe(4);
    await expect(test.help.start(QUESTION)).rejects.toThrow('help_target_unavailable');
    await test.help.start(QUESTION, second.id);
    expect(test.steps()[0]!.resolve()).toBe(second.header.node);
    expect(test.steps()[0]!.complete!()).toBe(false);
    second.header.state.expanded = true;
    expect(test.steps()[0]!.complete!()).toBe(true);
    test.panels.removeInstance(first.props.instanceId!);
    expect(test.help.state().phase).toBe('running');
    first.controls.camera('room');
    other.controls.camera('room');
    expect(test.steps()[1]!.complete!()).toBe(false);
    second.controls.camera('desk');
    expect(test.steps()[1]!.complete!()).toBe(false);
    second.controls.camera('room');
    expect(test.steps()[1]!.complete!()).toBe(true);
    second.controls.tour(true);
    expect(test.steps()[1]!.complete!()).toBe(false);
    second.controls.tour(false);
    expect(test.steps()[1]!.complete!()).toBe(true);
    test.help.cancel('done');
    expect(second.controls.read().camera).toBe('room');
    expect(second.listeners.size).toBe(1);
    test.lessons.dispose();
    expect(second.listeners.size).toBe(0);
  });

  it('rejects stale mounted identities even after the same instance remounts', async () => {
    const test = fixture();
    const instance = test.pin('same');
    const original = test.target('same', instance);
    original.unmount();
    original.unheader();
    const next = test.target('same', instance);
    expect(next.id).not.toBe(original.id);
    await expect(test.guide.prepare(original.id, new AbortController().signal)).rejects.toThrow(
      'help_target_unavailable',
    );
    await expect(test.help.start(QUESTION, original.id)).rejects.toThrow('help_target_unavailable');
    test.lessons.dispose();
  });

  it('revalidates pinned metadata between availability and prepare', async () => {
    const test = fixture();
    const instance = test.pin('original');
    const selected = test.target('original', instance);
    vi.spyOn(test.panels, 'instances').mockReturnValue([
      { id: instance, definitionId: PANEL, botId: 'replacement', label: 'Replacement' },
    ]);
    await expect(test.guide.prepare(selected.id, new AbortController().signal)).rejects.toThrow(
      'help_target_unavailable',
    );
    expect(selected.listeners.size).toBe(1);
    test.lessons.dispose();
    expect(selected.listeners.size).toBe(0);
  });

  it('retains mounted target discovery when the optional help service arrives late', async () => {
    const test = fixture(true);
    const selected = test.target('late-service');
    expect(test.help.availability(QUESTION).status).toBe('unavailable');
    const release = test.connect();
    await test.help.start(QUESTION, selected.id);
    expect(test.steps()[0]!.resolve()).toBe(selected.header.node);
    release();
    expect(selected.listeners.size).toBe(1);
    test.lessons.dispose();
    expect(selected.listeners.size).toBe(0);
  });

  it.each(['remove', 'close', 'unmount', 'header', 'rebind', 'dispose'] as const)(
    'cancels active lessons on %s',
    async (action) => {
      const test = fixture();
      const instance = test.pin('same');
      const selected = test.target('same', instance);
      await test.help.start(QUESTION, selected.id);
      expect(test.help.state().phase).toBe('running');
      if (action === 'remove') test.panels.removeInstance(instance);
      if (action === 'close') test.panels.reportOpen([]);
      if (action === 'unmount') selected.unmount();
      if (action === 'header') selected.unheader();
      if (action === 'rebind') {
        vi.spyOn(test.panels, 'instances').mockReturnValue([
          { id: instance, definitionId: PANEL, botId: 'different', label: 'Different' },
        ]);
        test.panels.reportOpen([instance, PANEL]);
      }
      if (action === 'dispose') test.lessons.dispose();
      expect(test.help.state().phase).toBe('idle');
      expect(test.steps()[1]!.complete!()).toBe(false);
      expect(selected.listeners.size).toBe(action === 'unmount' || action === 'dispose' ? 0 : 1);
      test.lessons.dispose();
      expect(selected.listeners.size).toBe(0);
      expect(selected.unsubscribe).toHaveBeenCalledTimes(1);
    },
  );

  it('cancels on contextual channel rebinding even for the same Bot', async () => {
    const test = fixture();
    const selected = test.target('same', undefined, 'channel-a');
    await test.help.start(QUESTION, selected.id);
    selected.unmount();
    selected.unheader();
    const next = test.target('same', undefined, 'channel-b');
    expect(test.help.state().phase).toBe('idle');
    expect(next.id).not.toBe(selected.id);
    expect(test.steps()[0]!.resolve()).toBeUndefined();
    test.lessons.dispose();
  });

  it('aborts and disposes idempotently without changing the camera', async () => {
    const test = fixture();
    const selected = test.target('cleanup');
    const abort = new AbortController();
    const prepared = await test.guide.prepare(selected.id, abort.signal);
    selected.controls.camera('portrait');
    abort.abort();
    prepared.dispose();
    prepared.dispose();
    expect(selected.unsubscribe).not.toHaveBeenCalled();
    expect(selected.listeners.size).toBe(1);
    expect(selected.controls.read().camera).toBe('portrait');
    expect(prepared.steps[0]!.resolve()).toBeUndefined();
    await expect(test.guide.prepare(selected.id, abort.signal)).rejects.toThrow();
    test.lessons.dispose();
    test.lessons.dispose();
    selected.unmount();
    expect(selected.listeners.size).toBe(0);
    expect(selected.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('releases a late preparation when the contribution is disposed', async () => {
    const test = fixture();
    const selected = test.target('late');
    const start = test.help.start(QUESTION, selected.id);
    test.release();
    await start;
    expect(test.help.state().phase).toBe('idle');
    expect(selected.listeners.size).toBe(1);
    test.lessons.dispose();
    expect(selected.listeners.size).toBe(0);
    expect(selected.unsubscribe).toHaveBeenCalledTimes(1);
  });
});
