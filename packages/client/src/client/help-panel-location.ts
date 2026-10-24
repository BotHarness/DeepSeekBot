import type { HelpGuide } from '../help-api.js';
import type { DockPanelHost, DockPanelRegistration } from './dock-panels.js';

export function panelLocationGuide(panels: DockPanelHost, panel: DockPanelRegistration): HelpGuide {
  const visible = (selector: string, attribute?: string): Element | undefined =>
    typeof document === 'undefined'
      ? undefined
      : [...document.querySelectorAll(selector)].find(
          (element) =>
            (!attribute || element.getAttribute(attribute) === panel.id) &&
            element.getClientRects().length > 0,
        );
  const locate = () => {
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
