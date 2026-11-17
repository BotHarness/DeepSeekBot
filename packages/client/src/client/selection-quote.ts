import { useSyncExternalStore } from 'react';

export interface SelectionQuote {
  readonly messageId: string;
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly below: boolean;
}

const TOOLBAR_GAP_PX = 8;
const TOOLBAR_ROOM_PX = 48;

function messageIdOf(node: Node): string | undefined {
  const element = node instanceof Element ? node : node.parentElement;
  if (element === null) return undefined;
  if (element.closest('[data-bubble-quotes], .bh-bubble-actions') !== null) return undefined;
  return element.closest('[data-message-id]')?.getAttribute('data-message-id') ?? undefined;
}

export function selectedMessageText(messageId: string): string | undefined {
  const selection = typeof window === 'undefined' ? null : window.getSelection();
  if (selection === null || selection.isCollapsed || selection.rangeCount === 0) return undefined;
  const range = selection.getRangeAt(0);
  if (messageIdOf(range.startContainer) !== messageId) return undefined;
  if (messageIdOf(range.endContainer) !== messageId) return undefined;
  const text = selection
    .toString()
    .replace(/\u200b/gu, '')
    .trim();
  return text.length === 0 ? undefined : text;
}

function currentSelectionQuote(): SelectionQuote | undefined {
  const selection = window.getSelection();
  if (selection === null || selection.isCollapsed || selection.rangeCount === 0) return undefined;
  const range = selection.getRangeAt(0);
  const messageId = messageIdOf(range.startContainer);
  if (messageId === undefined) return undefined;
  const text = selectedMessageText(messageId);
  if (text === undefined || typeof range.getBoundingClientRect !== 'function') return undefined;
  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return undefined;
  const below = rect.top < TOOLBAR_ROOM_PX;
  return {
    messageId,
    text,
    x: rect.left + rect.width / 2,
    y: below ? rect.bottom + TOOLBAR_GAP_PX : rect.top - TOOLBAR_GAP_PX,
    below,
  };
}

const listeners = new Set<() => void>();
let snapshot: SelectionQuote | undefined;
let pointerDown = false;
let frame = 0;

function publish(next: SelectionQuote | undefined): void {
  if (next === snapshot) return;
  snapshot = next;
  listeners.forEach((notify) => notify());
}

function refresh(): void {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => publish(pointerDown ? undefined : currentSelectionQuote()));
}

function onPointerDown(event: PointerEvent): void {
  if ((event.target as Element | null)?.closest?.('[data-selection-toolbar]')) return;
  pointerDown = true;
  publish(undefined);
}

function onPointerUp(): void {
  pointerDown = false;
  refresh();
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape') publish(undefined);
}

function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) {
    document.addEventListener('selectionchange', refresh);
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('pointerup', onPointerUp, true);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', refresh, true);
    window.addEventListener('resize', refresh);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0) return;
    cancelAnimationFrame(frame);
    pointerDown = false;
    snapshot = undefined;
    document.removeEventListener('selectionchange', refresh);
    document.removeEventListener('pointerdown', onPointerDown, true);
    document.removeEventListener('pointerup', onPointerUp, true);
    document.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('scroll', refresh, true);
    window.removeEventListener('resize', refresh);
  };
}

const read = (): SelectionQuote | undefined => snapshot;
const serverRead = (): SelectionQuote | undefined => undefined;

export function dismissSelectionQuote(): void {
  publish(undefined);
}

export function useSelectionQuote(
  enabled: boolean,
  canQuote: (messageId: string) => boolean,
): SelectionQuote | undefined {
  const quote = useSyncExternalStore(subscribe, read, serverRead);
  return enabled && quote !== undefined && canQuote(quote.messageId) ? quote : undefined;
}
