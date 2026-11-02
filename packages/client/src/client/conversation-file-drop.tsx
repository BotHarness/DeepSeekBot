import { useScopedState, useScopedRef } from './scoped-state.js';
import { type DragEvent, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';

import { IconPaperclipOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';

import { border, color, radius, space, text } from './ds/tokens.stylex.js';

const styles = stylex.create({
  overlay: {
    position: 'absolute',
    inset: space.x3,
    zIndex: 30,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.x3,
    borderWidth: border.focus,
    borderStyle: 'dashed',
    borderColor: color.accent,
    borderRadius: radius.lg,
    backgroundColor: color.base,
    color: color.fg,
    fontSize: text.titleSize,
    lineHeight: text.titleLine,
    fontWeight: text.strong,
    pointerEvents: 'none',
  },
  hint: {
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    fontWeight: text.regular,
  },
});

export interface ConversationFileDropHandlers {
  onDragEnter(event: DragEvent<HTMLElement>): void;
  onDragOver(event: DragEvent<HTMLElement>): void;
  onDragLeave(event: DragEvent<HTMLElement>): void;
  onDrop(event: DragEvent<HTMLElement>): void;
}

export function draggedFiles(event: Pick<DragEvent<HTMLElement>, 'dataTransfer'>): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files');
}

export function useConversationFileDrop(
  enabled: boolean,
  onFiles: (files: File[]) => void,
  scope?: string,
): { active: boolean; handlers: ConversationFileDropHandlers } {
  const [active, setActive] = useScopedState(scope, false);
  const depth = useScopedRef(scope, 0);
  const reset = (): void => {
    depth.current = 0;
    setActive(false);
  };
  return {
    active: enabled && active,
    handlers: {
      onDragEnter: (event) => {
        if (!enabled || !draggedFiles(event)) return;
        event.preventDefault();
        depth.current += 1;
        setActive(true);
      },
      onDragOver: (event) => {
        if (!enabled || !draggedFiles(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      },
      onDragLeave: (event) => {
        if (!enabled || !draggedFiles(event)) return;
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setActive(false);
      },
      onDrop: (event) => {
        if (!enabled || !draggedFiles(event)) return;
        event.preventDefault();
        event.stopPropagation();
        reset();
        const files = Array.from(event.dataTransfer.files);
        if (files.length > 0) onFiles(files);
      },
    },
  };
}

export function ConversationFileDropOverlay({
  label,
  hint,
}: {
  label: string;
  hint: string;
}): ReactElement {
  return (
    <div {...stylex.props(styles.overlay)} role="status" aria-live="polite">
      <IconPaperclipOutlineRegular size={24} />
      <span>{label}</span>
      <span {...stylex.props(styles.hint)}>{hint}</span>
    </div>
  );
}
