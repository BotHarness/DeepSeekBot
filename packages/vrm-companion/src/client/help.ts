import type {
  ClientHelpService,
  DockPanelProps,
  DockPanelRegistry,
  HelpContribution,
  HelpGuide,
} from '@botharness/ui/panels';
import type { PanelControls } from './controls.js';

const QUESTION = 'vrm:change-camera';
const PANEL = 'botharness-vrm';
type Controls = Pick<PanelControls, 'read' | 'subscribe'>;
type Mount = {
  id: string;
  identity: string;
  botId: string;
  panelId: string;
  root: Element;
  controls: Controls;
  unsubscribe(): void;
};

export function createVrmHelp(
  panels: DockPanelRegistry,
  help: () => ClientHelpService | undefined,
) {
  const mounts = new Map<string, Mount>();
  const headers = new Map<string, Element>();
  const listeners = new Set<() => void>();
  const availabilityListeners = new Set<() => void>();
  let availabilitySignature = '';
  let disposed = false;
  const identity = (props: DockPanelProps, botId: string) =>
    JSON.stringify([props.instanceId ?? null, botId, props.instanceId ? null : props.channel?.id]);
  const notify = () => {
    const signature = JSON.stringify(guide.availability());
    if (signature !== availabilitySignature) {
      availabilitySignature = signature;
      for (const listener of availabilityListeners) listener();
    }
    for (const listener of listeners) listener();
  };
  const visible = (element: Element | undefined): element is Element =>
    !!element?.isConnected && element.getClientRects().length > 0;
  const anchor = (mount: Mount) =>
    headers.get(mount.identity)?.querySelector('[data-vrm-scene-menu]') ?? undefined;
  const valid = (mount: Mount) => {
    if (disposed || mounts.get(mount.id) !== mount || !panels.isOpen(mount.panelId)) return false;
    if (mount.panelId !== PANEL) {
      const instance = panels.instances().find((item) => item.id === mount.panelId);
      if (instance?.definitionId !== PANEL || instance.botId !== mount.botId) return false;
    }
    return visible(mount.root) && visible(anchor(mount)) && mount.controls.read().scene.ready;
  };
  const guide: HelpGuide = {
    subscribe(listener) {
      availabilityListeners.add(listener);
      return () => {
        availabilityListeners.delete(listener);
      };
    },
    availability() {
      const targets = [...mounts.values()].filter(valid).map((mount, index) => ({
        id: mount.id,
        label: `${panels.panels().find((panel) => panel.id === mount.panelId)?.title ?? 'VRM Companion'} (${index + 1})`,
      }));
      if (targets.length === 1) return { status: 'ready', target: targets[0]! };
      if (targets.length > 1) return { status: 'select', targets };
      return {
        status: 'unavailable',
        reason: {
          en: 'Open a VRM Companion panel and wait for its Scene control to be ready.',
          zh: '请打开 VRM 陪伴面板，等待场景控件就绪。',
        },
      };
    },
    async prepare(targetId, signal) {
      signal.throwIfAborted();
      const mount = mounts.get(targetId);
      if (!mount || !valid(mount)) throw new Error('help_target_unavailable');
      const initial = mount.controls.read().camera;
      const camera = initial === 'room' ? 'desk' : 'room';
      let changed = false;
      let released = false;
      const dispose = () => {
        if (released) return;
        released = true;
        signal.removeEventListener('abort', dispose);
        listeners.delete(check);
      };
      const check = () => {
        if (released) return;
        if (!valid(mount)) {
          dispose();
          const service = help();
          if (service?.state().questionId === QUESTION) service.cancel('target-unavailable');
          return;
        }
        const state = mount.controls.read();
        if (state.camera === camera && !state.tour) changed = true;
      };
      listeners.add(check);
      signal.addEventListener('abort', dispose, { once: true });
      const resolve = () => {
        check();
        return !released && valid(mount) ? headers.get(mount.identity) : undefined;
      };
      return {
        dispose,
        steps: [
          {
            title: { en: 'Open Scene', zh: '打开场景菜单' },
            description: {
              en: 'Open Scene on this character. Camera choices are in this menu.',
              zh: '打开这个角色的场景菜单，相机选项就在其中。',
            },
            resolve,
            complete: () => !!resolve() && anchor(mount)?.getAttribute('aria-expanded') === 'true',
          },
          {
            title: { en: 'Change the camera', zh: '切换相机' },
            description: {
              en: `Choose ${camera === 'room' ? 'Room view' : 'Desk view'} in Scene. Done unlocks when this character’s camera changes. Your change stays after the guide ends.`,
              zh: `在场景菜单选择${camera === 'room' ? '房间视角' : '桌边视角'}。这个角色的相机切换后即可完成，退出教程不会撤销修改。`,
            },
            resolve,
            complete: () => {
              if (!resolve()) return false;
              const state = mount.controls.read();
              return changed && state.camera === camera && !state.tour;
            },
          },
        ],
      };
    },
  };
  const contribution: HelpContribution = {
    id: 'vrm:help',
    topics: [
      {
        id: 'vrm:companion-help',
        panelId: PANEL,
        title: { en: 'VRM Companion', zh: 'VRM 陪伴' },
        overview: {
          en: 'A character that follows your Bot’s activity.',
          zh: '跟随 Bot 活动的虚拟角色。',
        },
        questions: [
          {
            id: 'vrm:open-companion',
            title: { en: 'Where can I open a character?', zh: '在哪里打开虚拟角色？' },
            answer: {
              en: 'Open a Bot conversation and choose VRM Companion in the Messages header. Pin a character globally to keep it bound to that Bot. Hiding the panel does not stop the Bot.',
              zh: '打开 Bot 私聊，在消息标题栏选择 VRM 陪伴。可将角色固定到全局面板，保持绑定该 Bot。隐藏面板不会停止 Bot。',
            },
          },
          {
            id: QUESTION,
            title: { en: 'How do I change the camera?', zh: '如何切换相机？' },
            answer: {
              en: 'Use Scene in the character header to choose a camera. Open the character first; if several are visible, choose the one to practise on. The guide keeps your camera changes.',
              zh: '在角色标题栏的场景菜单中选择相机。请先打开角色；有多个可见角色时，选择要练习的那个。教程会保留相机修改。',
            },
            keywords: ['camera', 'Scene', '相机', '场景'],
            guide,
          },
        ],
      },
    ],
  };
  const unsubscribe = panels.subscribe(notify);
  return {
    contribution,
    mount(props: DockPanelProps, botId: string, root: Element, controls: Controls) {
      if (disposed) return () => {};
      const id = `vrm:mounted:${crypto.randomUUID()}`;
      const mount: Mount = {
        id,
        identity: identity(props, botId),
        botId,
        panelId: props.instanceId ?? PANEL,
        root,
        controls,
        unsubscribe: () => {},
      };
      mounts.set(id, mount);
      mount.unsubscribe = controls.subscribe(notify);
      notify();
      return () => {
        if (mounts.get(id) !== mount) return;
        mount.unsubscribe();
        mounts.delete(id);
        notify();
      };
    },
    header(props: DockPanelProps, botId: string, element: Element) {
      if (disposed) return () => {};
      const key = identity(props, botId);
      headers.set(key, element);
      notify();
      return () => {
        if (headers.get(key) !== element) return;
        headers.delete(key);
        notify();
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      notify();
      unsubscribe();
      for (const mount of mounts.values()) mount.unsubscribe();
      mounts.clear();
      headers.clear();
      listeners.clear();
      availabilityListeners.clear();
    },
  };
}
