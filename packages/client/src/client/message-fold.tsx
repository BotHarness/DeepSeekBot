import { useState, type ReactElement, type ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';

import { border, color, radius, space, text } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import type { ChannelMessage } from './store.js';

export const MESSAGE_FOLD_THRESHOLD_PX = 480;
export const MESSAGE_FOLD_HEIGHT_PX = 300;

const expanded = new Set<string>();

const sizeListeners = new Map<Element, () => void>();
let sizeObserver: ResizeObserver | undefined;

function observeSizes(targets: readonly Element[], listener: () => void): () => void {
  if (typeof ResizeObserver === 'undefined') return () => {};
  sizeObserver ??= new ResizeObserver((entries) => {
    const due = new Set<() => void>();
    for (const entry of entries) {
      const notify = sizeListeners.get(entry.target);
      if (notify) due.add(notify);
    }
    for (const notify of due) notify();
  });
  for (const target of targets) {
    sizeListeners.set(target, listener);
    sizeObserver.observe(target);
  }
  return () => {
    for (const target of targets) {
      if (sizeListeners.get(target) !== listener) continue;
      sizeListeners.delete(target);
      sizeObserver?.unobserve(target);
    }
    if (sizeListeners.size > 0) return;
    sizeObserver?.disconnect();
    sizeObserver = undefined;
  };
}

export function messageFolds(height: number): boolean {
  return height > MESSAGE_FOLD_THRESHOLD_PX;
}

export function foldableMessage(message: ChannelMessage): boolean {
  return (
    message.pending !== true &&
    message.streaming !== true &&
    message.contentPurged !== true &&
    message.onboardingWelcome === undefined &&
    message.sessionFailure === undefined &&
    message.toolApprovalRequest === undefined &&
    message.privateInputRequest === undefined &&
    message.userQuestionRequest === undefined &&
    message.grantRequest !== true
  );
}

const styles = stylex.create({
  folded: {
    maxHeight: `${MESSAGE_FOLD_HEIGHT_PX}px`,
    overflow: 'hidden',
    maskImage: 'linear-gradient(to bottom, black calc(100% - 64px), transparent)',
  },
  toggle: {
    display: 'inline-flex',
    alignItems: 'center',
    marginTop: space.x2,
    paddingBlock: space.x1,
    paddingInline: space.x3,
    borderWidth: 0,
    borderRadius: radius.sm,
    backgroundColor: { default: 'transparent', ':hover': color.hover },
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    fontWeight: text.strong,
    cursor: 'pointer',
    outline: { default: 'none', ':focus-visible': `${border.focus} solid ${color.accent}` },
  },
});

export function MessageFold({
  messageId,
  enabled,
  t,
  children,
}: {
  messageId: string;
  enabled: boolean;
  t: BotHarnessTranslate;
  children: ReactNode;
}): ReactElement {
  const [long, setLong] = useState(false);
  const [open, setOpen] = useState(() => expanded.has(messageId));
  const measure = useMountedResource<HTMLDivElement>(
    (element) => {
      if (!enabled) {
        setLong(false);
        return;
      }
      const update = (): void => setLong(messageFolds(element.scrollHeight));
      update();
      return observeSizes([element, ...Array.from(element.children)], update);
    },
    [enabled],
  );
  const folded = enabled && long && !open;
  return (
    <>
      <div
        ref={measure}
        data-message-fold={folded ? 'folded' : 'open'}
        {...stylex.props(folded && styles.folded)}
      >
        {children}
      </div>
      {enabled && long ? (
        <button
          type="button"
          data-message-fold-toggle=""
          aria-expanded={open}
          {...stylex.props(styles.toggle)}
          onClick={(event) => {
            const next = !open;
            if (next) expanded.add(messageId);
            else expanded.delete(messageId);
            setOpen(next);
            if (!next) {
              const toggle = event.currentTarget;
              window.requestAnimationFrame(() => toggle.scrollIntoView({ block: 'nearest' }));
            }
          }}
        >
          {t(open ? 'message.fold.collapse' : 'message.fold.expand')}
        </button>
      ) : null}
    </>
  );
}
