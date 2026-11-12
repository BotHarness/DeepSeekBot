import { useCallback, useLayoutEffect, useRef } from 'react';

const HEADERS = ['.bh-dock-header', '[data-dock-header]', '.bh-activity-center-header'];
export const SEARCH_OPEN_ATTRIBUTE = 'data-bh-search-open';

function headersOf(node: Element): Element[] {
  const found: Element[] = [];
  for (const selector of HEADERS) {
    const header = node.closest(selector);
    if (header !== null && !found.includes(header)) found.push(header);
  }
  return found;
}

export function useSearchOpenMark(open: boolean): (node: HTMLElement | null) => void {
  const node = useRef<HTMLElement | null>(null);
  const marked = useRef<Element[]>([]);
  const clear = (): void => {
    for (const header of marked.current) header.removeAttribute(SEARCH_OPEN_ATTRIBUTE);
    marked.current = [];
  };
  const apply = (): void => {
    clear();
    if (!open || node.current === null) return;
    marked.current = headersOf(node.current);
    for (const header of marked.current) header.setAttribute(SEARCH_OPEN_ATTRIBUTE, '');
  };
  const latest = useRef(apply);
  latest.current = apply;
  useLayoutEffect(() => {
    latest.current();
  }, [open]);
  useLayoutEffect(() => clear, []);
  return useCallback((element: HTMLElement | null) => {
    node.current = element;
    latest.current();
  }, []);
}
