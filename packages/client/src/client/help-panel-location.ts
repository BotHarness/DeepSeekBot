import { CHANNEL_WORKSPACE_PANELS } from './channel-split-layout.js';
import { CHANNEL_BODY_PANEL } from './channel-dock-layout.js';
import type { HelpGuide, HelpStep } from '../help-api.js';
import type { DockPanelHost, DockPanelRegistration } from './dock-panels.js';

export function panelLocationGuide(
  panels: DockPanelHost,
  panel: DockPanelRegistration,
  invalidated: () => void = () => {},
): HelpGuide {
  const nested =
    CHANNEL_WORKSPACE_PANELS.includes(panel.id) ||
    panel.binding === 'current-bot' ||
    ['bot-inbox', 'members'].includes(panel.id);
  const visible = (selector: string, attribute?: string, id = panel.id): Element | undefined =>
    typeof document === 'undefined'
      ? undefined
      : [...document.querySelectorAll(selector)].find(
          (element) =>
            (!attribute || element.getAttribute(attribute) === id) &&
            element.getClientRects().length > 0,
        );
  const parentHeader = () => visible('[data-dock-header]', 'data-dock-header', CHANNEL_BODY_PANEL);
  const parentControl = () =>
    visible('[data-pinned-panel]', 'data-pinned-panel', CHANNEL_BODY_PANEL);
  const nestedTarget = () =>
    visible('[data-dock-header]', 'data-dock-header') ??
    visible('[data-help-panel-control]', 'data-help-panel-control') ??
    parentHeader();
  const locate = () => {
    if (nested) {
      const element = nestedTarget();
      if (element) return { element, kind: 'nested' } as const;
      const parent = parentControl();
      return parent ? ({ element: parent, kind: 'parent' } as const) : undefined;
    }
    const header = visible('[data-dock-header]', 'data-dock-header');
    if (header) return { element: header, kind: 'panel' } as const;
    const control =
      visible('[data-help-panel-control]', 'data-help-panel-control') ??
      visible('[data-pinned-panel]', 'data-pinned-panel');
    if (control) return { element: control, kind: 'control' } as const;
    const switcher = visible('[data-dock-menu] button[aria-haspopup="menu"]');
    return switcher ? ({ element: switcher, kind: 'switcher' } as const) : undefined;
  };
  const available = () =>
    panels.available() &&
    panels.panels().some((item) => item.id === panel.id) &&
    (panels.canOpen?.(panel.id) ?? true) &&
    !!locate();
  return {
    actionLabel: { en: 'Show location', zh: '显示位置' },
    availability: () =>
      available()
        ? { status: 'ready', target: { id: panel.id, label: panel.title } }
        : {
            status: 'unavailable',
            reason: {
              en: 'Select a conversation where this panel is available, then try again.',
              zh: '请先选择可使用此面板的对话，再查看位置。',
            },
          },
    async prepare(id, signal) {
      signal.throwIfAborted();
      const target = locate();
      if (id !== panel.id || !available() || !target) throw new Error('help_target_unavailable');
      if (nested) {
        const needsParent = !parentHeader();
        const steps: HelpStep[] = [];
        if (needsParent)
          steps.push({
            title: { en: `Messages → ${panel.title}`, zh: `消息 → ${panel.title}` },
            description: {
              en: `${panel.title} lives inside Messages. Click the highlighted Messages button, then choose Next. The temporary panel visibility will be restored when this hint ends.`,
              zh: `「${panel.title}」在消息面板里面。先点击高亮的消息按钮，打开后再点下一步。结束提示后会恢复原来的面板布局。`,
            },
            resolve: parentControl,
            complete: () => !!parentHeader(),
          });
        steps.push({
          title: { en: `Messages → ${panel.title}`, zh: `消息 → ${panel.title}` },
          description:
            target.element.getAttribute('data-dock-header') === panel.id
              ? {
                  en: `${panel.title} is already open inside Messages. This is the subpanel’s header. Choose Done when you have found it.`,
                  zh: `「${panel.title}」是消息面板的子面板，现在已经打开。这里是子面板的标题栏，确认位置后点击完成即可。`,
                }
              : {
                  en: `${panel.title} is a subpanel of Messages. Look for its button in the Messages header; click it to show the subpanel. If the control is hidden, right-click that header to show it. Choose Done when finished.${needsParent ? ' The original layout will be restored.' : ''}`,
                  zh: `「${panel.title}」是消息面板的子面板。在消息标题栏找到它的按钮，点击即可展开。如果按钮被隐藏，可右键消息标题栏将它显示出来。查看后点击完成。${needsParent ? '结束后会恢复原来的布局。' : ''}`,
                },
          resolve: nestedTarget,
        });
        const release = needsParent
          ? panels.beginGuide(invalidated, { presentMessages: false })
          : () => {};
        return { steps, dispose: release };
      }
      const description =
        target.kind === 'panel'
          ? {
              en: `This is the ${panel.title} panel header. Choose Done to dismiss this hint. You can then drag this header to move the panel or use its close button to hide it.`,
              zh: `这里是「${panel.title}」的标题栏。点击完成收起提示后，可以拖动标题栏调整位置，或点击关闭按钮隐藏面板。`,
            }
          : target.kind === 'control'
            ? {
                en: `This button opens ${panel.title}. Choose Done to dismiss this hint, then click the button. Its highlighted state means the panel is open; click it again to close the panel.`,
                zh: `这个按钮可以打开「${panel.title}」。点击完成收起提示，再点击此按钮。按钮亮起表示面板已打开，再点一次可以关闭。`,
              }
            : {
                en: `This is the panel switcher. Choose Done to dismiss this hint, click this button, then choose ${panel.title} from the list.`,
                zh: `这里是面板切换器。点击完成收起提示，再点击这个按钮，从列表中选择「${panel.title}」。`,
              };
      return {
        dispose() {},
        steps: [
          {
            title: { en: `Find ${panel.title}`, zh: `找到「${panel.title}」` },
            description,
            resolve: () =>
              target.element.isConnected && target.element.getClientRects().length > 0
                ? target.element
                : undefined,
          },
        ],
      };
    },
  };
}
