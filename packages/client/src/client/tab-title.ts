export interface TabTitleAttention {
  unreadCount: number;
  hasAction: boolean;
}

export const TAB_TITLE_ACTION_MARK = '●';

export function formatTabTitle(base: string, attention: TabTitleAttention): string {
  const parts: string[] = [];
  if (attention.hasAction) parts.push(TAB_TITLE_ACTION_MARK);
  if (attention.unreadCount > 0)
    parts.push(`(${attention.unreadCount > 99 ? '99+' : attention.unreadCount})`);
  return parts.length === 0 ? base : `${parts.join(' ')} ${base}`;
}

export interface TabTitleDocument {
  title: string;
  head: Node | null;
}

export interface TabTitleSource {
  getSnapshot(): { humanInbox: TabTitleAttention };
  subscribe(listener: () => void): () => void;
}

export function mountTabTitle(
  source: TabTitleSource,
  doc: TabTitleDocument,
  observe: (target: Node, onChange: () => void) => () => void = observeTitle,
): () => void {
  let base = doc.title;
  let written: string | undefined;
  let attention: TabTitleAttention = { unreadCount: 0, hasAction: false };
  const apply = (): void => {
    if (doc.title !== written) base = doc.title;
    const next = formatTabTitle(base, attention);
    written = next;
    if (doc.title !== next) doc.title = next;
  };
  const read = (): void => {
    const { unreadCount, hasAction } = source.getSnapshot().humanInbox;
    if (unreadCount === attention.unreadCount && hasAction === attention.hasAction) return;
    attention = { unreadCount, hasAction };
    apply();
  };
  read();
  const unsubscribe = source.subscribe(read);
  const unobserve = doc.head === null ? () => {} : observe(doc.head, apply);
  return () => {
    unsubscribe();
    unobserve();
    if (doc.title === written) doc.title = base;
  };
}

function observeTitle(target: Node, onChange: () => void): () => void {
  if (typeof MutationObserver === 'undefined') return () => {};
  const observer = new MutationObserver(onChange);
  observer.observe(target, { subtree: true, childList: true, characterData: true });
  return () => observer.disconnect();
}
