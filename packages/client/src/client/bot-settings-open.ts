const SETTINGS_LABELS = ['设置', 'Settings'];
const ACCOUNT_LABELS = ['账号菜单', 'Account menu'];
const MODEL_LABELS = ['模型', 'Models'];
const IM_LABELS = ['IM机器人', 'IM Bots'];
const SETTLE_TIMEOUT_MS = 10000;

let nativeSettingsVisible = false;
let activeNavigation: (() => void) | undefined;
const listeners = new Set<() => void>();

export const nativeSettingsNavigation = {
  getSnapshot: (): boolean => nativeSettingsVisible,
  close: (): void => activeNavigation?.(),
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

function showNativeSettings(visible: boolean): void {
  if (nativeSettingsVisible === visible) return;
  nativeSettingsVisible = visible;
  for (const listener of listeners) listener();
}

function controlText(node: Node): string {
  if (node instanceof Element) {
    if (node.getAttribute('aria-hidden') === 'true') return '';
    const label = node.getAttribute('aria-label');
    if (label !== null) return label;
  }
  return node.childNodes.length === 0
    ? (node.textContent ?? '')
    : [...node.childNodes].map(controlText).join('');
}

function namedControl(root: ParentNode, labels: readonly string[]): HTMLElement | undefined {
  return [...root.querySelectorAll<HTMLElement>('button, [role="menuitem"]')].find((control) =>
    labels.some((label) => controlText(control).trim().toLowerCase() === label.toLowerCase()),
  );
}

function openSettingsSection(
  doc: Document,
  labels: readonly string[],
  select: (dialog: HTMLElement, nav: HTMLElement) => boolean,
  callbacks: {
    ready?: (dialog: HTMLElement) => void;
    unavailable?: () => void;
    returned?: () => void;
  } = {},
): () => void {
  activeNavigation?.();
  let stopped = false;
  let selected = false;
  let accountOpened = false;
  let settingsOpened = false;
  let dialog: HTMLElement | undefined;
  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    observer.disconnect();
    clearTimeout(timer);
    if (activeNavigation === stop) {
      activeNavigation = undefined;
      showNativeSettings(false);
    }
  };
  const inspect = (): void => {
    if (stopped) return;
    if (dialog !== undefined && !dialog.isConnected) {
      stop();
      callbacks.returned?.();
      return;
    }
    if (selected) return;
    dialog ??= [...doc.querySelectorAll<HTMLElement>('[role="dialog"]')].find(
      (candidate) => namedControl(candidate, labels) !== undefined,
    );
    if (dialog !== undefined) {
      const nav = namedControl(dialog, labels);
      if (nav !== undefined && select(dialog, nav)) {
        selected = true;
        clearTimeout(timer);
        callbacks.ready?.(dialog);
      }
      return;
    }
    const settings = namedControl(doc, SETTINGS_LABELS);
    if (settings !== undefined && !settingsOpened) {
      settingsOpened = true;
      settings.click();
      return;
    }
    const account = namedControl(doc, ACCOUNT_LABELS);
    if (account !== undefined && !accountOpened) {
      accountOpened = true;
      if (account.getAttribute('aria-expanded') !== 'true') account.click();
    }
  };
  const observer = new MutationObserver(inspect);
  observer.observe(doc.body, { childList: true, subtree: true });
  const timer = setTimeout(() => {
    stop();
    callbacks.unavailable?.();
  }, SETTLE_TIMEOUT_MS);
  activeNavigation = stop;
  showNativeSettings(true);
  inspect();
  return stop;
}

function selectModels(_dialog: HTMLElement, nav: HTMLElement): boolean {
  nav.click();
  return true;
}

export function openModelsSettings(doc?: Document): void {
  const target = doc ?? (typeof document === 'undefined' ? undefined : document);
  if (target !== undefined) openSettingsSection(target, MODEL_LABELS, selectModels);
}

export function openImSettings(
  doc: Document,
  ready: (element: Element) => void,
  unavailable: () => void = () => {},
  selectFeishu = true,
): () => void {
  let navSelected = false;
  return openSettingsSection(
    doc,
    IM_LABELS,
    (dialog, nav) => {
      if (!navSelected) {
        navSelected = true;
        nav.click();
      }
      if (!selectFeishu) return true;
      const platform = namedControl(dialog, ['飞书', 'Feishu', 'Lark / Feishu']);
      if (platform === undefined) return false;
      platform.click();
      return true;
    },
    { ready, unavailable },
  );
}

export function openExternalBindingSettings(
  doc: Document,
  returned: () => void,
  unavailable: () => void,
): () => void {
  return openSettingsSection(
    doc,
    IM_LABELS,
    (_dialog, nav) => {
      nav.click();
      return true;
    },
    { returned, unavailable },
  );
}

export function openModelsSettingsAndReturn(returned: () => void): () => void {
  return openSettingsSection(document, MODEL_LABELS, selectModels, {
    returned,
    unavailable: returned,
  });
}
