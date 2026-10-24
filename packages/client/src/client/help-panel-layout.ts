import type { HelpGuide, HelpStep } from '../help-api.js';
import type { DockPanelHost, DockPanelLayoutState, DockPanelRegistration } from './dock-panels.js';
import { isMessagesPanel } from './help-panel-discovery.js';

export function panelLayoutGuide(
  panels: DockPanelHost,
  definition: DockPanelRegistration,
  invalidated: () => void,
): HelpGuide {
  const candidates = () => {
    const ids = new Set([
      definition.id,
      ...panels
        .instances()
        .filter((item) => item.definitionId === definition.id)
        .map((item) => item.id),
    ]);
    return panels
      .panels()
      .filter((panel) => ids.has(panel.id) && (panels.canOpen?.(panel.id) ?? true));
  };
  return {
    actionLabel: { en: 'Practice layout', zh: '练习调整布局' },
    availability() {
      const targets = panels.available()
        ? candidates().map(({ id, title }) => ({ id, label: title }))
        : [];
      return targets.length === 1
        ? { status: 'ready', target: targets[0]! }
        : targets.length > 1
          ? { status: 'select', targets }
          : {
              status: 'unavailable',
              reason: {
                en: 'Open a conversation where this panel is available.',
                zh: '请先打开可使用此面板的对话。',
              },
            };
    },
    async prepare(id, signal) {
      signal.throwIfAborted();
      const instance = candidates().find((panel) => panel.id === id);
      if (!instance || !panels.available()) throw new Error('help_target_unavailable');
      const release = panels.beginGuide(invalidated, { presentMessages: false });
      let disposed = false;
      let off = () => {};
      const dispose = () => {
        if (disposed) return;
        disposed = true;
        signal.removeEventListener('abort', dispose);
        off();
        release();
      };
      signal.addEventListener('abort', dispose, { once: true });
      try {
        off = panels.subscribe(() => {
          if (!panels.panels().includes(instance) || !(panels.canOpen?.(id) ?? true)) invalidated();
        });
        panels.open(id);
        const nested = isMessagesPanel(instance);
        const visible = (selector: string) =>
          [...document.querySelectorAll(selector)].find(
            (element) => element.getClientRects().length > 0,
          );
        const header = () =>
          [...document.querySelectorAll('[data-dock-header]')].find(
            (element) =>
              element.getAttribute('data-dock-header') === id &&
              element.getClientRects().length > 0,
          );
        const workspace = () =>
          nested ? visible('[data-channel-workspace]') : visible('[data-workspace-dock]');
        const changed = (kind: 'move' | 'resize'): HelpStep => {
          let initial: DockPanelLayoutState | undefined;
          let completed = false;
          return {
            title:
              kind === 'move'
                ? { en: `Move ${instance.title}`, zh: `移动「${instance.title}」` }
                : { en: `Resize ${instance.title}`, zh: `调整「${instance.title}」的大小` },
            description:
              kind === 'move'
                ? {
                    en: 'Drag the icon at the left of this panel’s header beside another panel. Keep both panels visible. Choose Next after the panel moves. This practice will not change your saved layout.',
                    zh: '将此面板标题左侧的图标拖到另一个面板旁边，保持两个面板都可见。移动后点击下一步。练习不会修改已保存的布局。',
                  }
                : {
                    en: 'Drag a divider beside this panel to change its size, then choose Next. Other panels remain available during practice.',
                    zh: '拖动此面板旁边的分隔线调整大小，再点击下一步。练习期间仍可操作其他面板。',
                  },
            resolve() {
              initial ??= panels.layoutState(id);
              return workspace();
            },
            complete() {
              const current = panels.layoutState(id);
              if (
                kind === 'resize' &&
                initial &&
                current &&
                initial.placement !== current.placement
              ) {
                initial = current;
                return completed;
              }
              if (initial && current)
                completed ||=
                  kind === 'move'
                    ? initial.placement !== current.placement
                    : initial.placement === current.placement && initial.resize !== current.resize;
              return completed;
            },
          };
        };
        return {
          dispose,
          steps: [
            {
              title: { en: `Find ${instance.title}`, zh: `找到「${instance.title}」` },
              description: {
                en: 'This is the panel you will practice with. Next opens the workspace for moving and resizing. Finish or close the guide to restore your layout.',
                zh: '接下来将用这个面板练习。点击下一步后，可在工作区移动面板和调整大小。完成或退出教程都会恢复原来的布局。',
              },
              resolve: header,
            },
            changed('move'),
            changed('resize'),
            {
              title: { en: 'Hide the panel', zh: '隐藏面板' },
              description: {
                en: 'Use this panel’s close button. Hiding a panel does not stop its Bot or revoke access. Choose Next after closing it.',
                zh: '点击此面板的关闭按钮。隐藏面板不会停止 Bot，也不会撤销权限。关闭后点击下一步。',
              },
              resolve: workspace,
              complete: () => !panels.isOpen(id),
            },
            {
              title: { en: 'Reopen the panel', zh: '重新打开面板' },
              description: {
                en: `Open ${instance.title} from its panel control or the panel switcher. Messages subpanels use the controls in the Messages header. Choose Done to restore the original layout.`,
                zh: `从面板按钮或面板切换器重新打开「${instance.title}」。消息子面板使用消息标题栏中的按钮。点击完成会恢复原来的布局。`,
              },
              resolve: () => visible('[data-workspace-dock]'),
              complete: () => panels.isOpen(id),
            },
          ],
        };
      } catch (error) {
        dispose();
        throw error;
      }
    },
  };
}
