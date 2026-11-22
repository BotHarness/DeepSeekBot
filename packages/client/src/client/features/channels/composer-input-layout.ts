import type { KeyboardEvent } from 'react';
import type { ComposerSendKey } from '../../composer-send-key.js';

export function shouldSubmitComposerKey(
  event: Pick<KeyboardEvent<HTMLElement>, 'key' | 'shiftKey' | 'nativeEvent'> &
    Partial<Pick<KeyboardEvent<HTMLElement>, 'ctrlKey' | 'metaKey'>>,
  sendKey: ComposerSendKey = 'enter',
): boolean {
  return (
    event.key === 'Enter' &&
    (sendKey === 'shift-enter' ? event.shiftKey : !event.shiftKey) &&
    (sendKey !== 'mod-enter' || event.ctrlKey === true || event.metaKey === true) &&
    !event.nativeEvent.isComposing &&
    event.nativeEvent.keyCode !== 229
  );
}

export interface ComposerTextareaFit {
  expanded: boolean;
  height: number;
}

function compactComposerScrollHeight(element: HTMLElement, currentHeight: number): number {
  const composer = element.closest<HTMLElement>('.bh-composer');
  if (!composer?.classList.contains('bh-composer-with-footer')) return currentHeight;
  const style = getComputedStyle(composer);
  const left = Number.parseFloat(style.getPropertyValue('--bh-composer-compact-padding-left'));
  const right = Number.parseFloat(style.getPropertyValue('--bh-composer-compact-padding-right'));
  const compactWidth = composer.clientWidth - left - right;
  if (!Number.isFinite(compactWidth) || compactWidth <= 0) return currentHeight;

  const mirror = element.cloneNode(true) as HTMLElement;
  if (element instanceof HTMLTextAreaElement && mirror instanceof HTMLTextAreaElement)
    mirror.value = element.value;
  mirror.setAttribute('aria-hidden', 'true');
  mirror.style.position = 'absolute';
  mirror.style.visibility = 'hidden';
  mirror.style.pointerEvents = 'none';
  mirror.style.width = compactWidth + 'px';
  mirror.style.height = '0px';
  mirror.style.minHeight = '0px';
  mirror.style.maxHeight = 'none';
  mirror.style.overflow = 'hidden';
  mirror.style.transition = 'none';
  composer.append(mirror);
  const compactHeight = mirror.scrollHeight;
  mirror.remove();
  return compactHeight;
}

export function fitComposerTextarea(
  element: Pick<HTMLElement, 'scrollHeight' | 'style'>,
  maxHeight = 144,
  singleLineHeight = 34,
): ComposerTextareaFit {
  element.style.height = '0px';
  const scrollHeight = element.scrollHeight;
  const height = Math.min(scrollHeight, maxHeight);
  element.style.height = `${height}px`;
  element.style.overflowY = scrollHeight > maxHeight ? 'auto' : 'hidden';
  const compactHeight =
    scrollHeight <= singleLineHeight &&
    typeof HTMLElement !== 'undefined' &&
    element instanceof HTMLElement
      ? compactComposerScrollHeight(element, scrollHeight)
      : scrollHeight;
  return { expanded: compactHeight > singleLineHeight, height };
}
