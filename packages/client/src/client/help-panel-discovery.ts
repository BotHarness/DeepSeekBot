import { CHANNEL_BODY_PANEL } from './channel-dock-layout.js';
import { CHANNEL_WORKSPACE_PANELS } from './channel-split-layout.js';
import type { HelpGuide, HelpStep } from '../help-api.js';
import type { DockPanelHost, DockPanelRegistration } from './dock-panels.js';

export function isMessagesPanel(panel: DockPanelRegistration): boolean {
  return (
    CHANNEL_WORKSPACE_PANELS.includes(panel.id) ||
    panel.binding === 'current-bot' ||
    ['bot-inbox', 'members'].includes(panel.id)
  );
}

export function panelDiscoveryGuide(
  panels: DockPanelHost,
  definition: DockPanelRegistration,
  invalidated: () => void,
): HelpGuide {
  const available = () =>
    panels.available() &&
    panels.panels().includes(definition) &&
    (panels.canOpen?.(definition.id) ?? true);
  return {
    actionLabel: { en: 'Find in Messages', zh: '在消息中查找' },
    availability: () =>
      available()
        ? { status: 'ready', target: { id: definition.id, label: definition.title } }
        : {
            status: 'unavailable',
            reason: {
              en:
                definition.id === 'members'
                  ? 'Select a group conversation first.'
                  : definition.id === 'sessions'
                    ? 'Select a conversation first.'
                    : 'Select a Bot conversation first.',
              zh:
                definition.id === 'members'
                  ? '请先选择群聊。'
                  : definition.id === 'sessions'
                    ? '请先选择一个对话。'
                    : '请先选择 Bot 私聊。',
            },
          },
    async prepare(id, signal) {
      signal.throwIfAborted();
      if (id !== definition.id || !available()) throw new Error('help_target_unavailable');
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
          if (!available()) invalidated();
        });
        const visible = (attribute: string, value: string) =>
          [...document.querySelectorAll(`[${attribute}]`)].find(
            (element) =>
              element.getAttribute(attribute) === value && element.getClientRects().length > 0,
          );
        const parent = () => visible('data-dock-header', CHANNEL_BODY_PANEL);
        const control = () => visible('data-help-panel-control', id) ?? parent();
        const steps: HelpStep[] = [];
        if (!parent())
          steps.push({
            title: { en: 'Open Messages', zh: '打开消息面板' },
            description: {
              en: 'Use the Messages button to open the parent panel, then choose Next. Your original layout will be restored when this guide ends.',
              zh: '点击消息按钮打开父面板，再点击下一步。教程结束后会恢复原来的布局。',
            },
            resolve: () => visible('data-pinned-panel', CHANNEL_BODY_PANEL),
            complete: () => !!parent(),
          });
        steps.push({
          title: { en: `Messages → ${definition.title}`, zh: `消息 → ${definition.title}` },
          description: {
            en: `Open ${definition.title} with its button in the Messages header. If the button is hidden, right-click that header to show it. Choose Next once the subpanel is open.`,
            zh: `点击消息标题栏中的按钮打开「${definition.title}」。如果按钮被隐藏，右键消息标题栏可将它显示出来。子面板打开后点击下一步。`,
          },
          resolve: control,
          complete: () => panels.isOpen(id),
        });
        steps.push({
          title: { en: definition.title, zh: definition.title },
          description: {
            en: 'This is the real subpanel for your selected conversation. Finish or close this guide to restore its original visibility and layout. Settings and message drafts are kept.',
            zh: '这是当前对话的真实子面板。完成或退出教程后，会恢复原来的面板布局与显示状态，实际设置和消息草稿会保留。',
          },
          resolve: () =>
            visible('data-dock-header', id) ?? visible('data-channel-subpanel', id) ?? control(),
          complete: () => panels.isOpen(id),
        });
        return { steps, dispose };
      } catch (error) {
        dispose();
        throw error;
      }
    },
  };
}
