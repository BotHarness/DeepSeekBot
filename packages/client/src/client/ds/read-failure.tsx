import type { ReactElement, ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import { ActionButton, ActionGroup } from './action-button.js';
import { Note } from './note.js';
import { space } from './tokens.stylex.js';

const styles = stylex.create({ root: { display: 'grid', gap: space.x3, minWidth: 0 } });
export function ReadFailure({
  children,
  retryLabel,
  onRetry,
  busy = false,
  disabled = false,
}: {
  children: ReactNode;
  retryLabel: string;
  onRetry(): void;
  busy?: boolean;
  disabled?: boolean;
}): ReactElement {
  return (
    <div {...stylex.props(styles.root)}>
      <Note tone="danger">{children}</Note>
      <ActionGroup>
        <ActionButton icon="refresh" busy={busy} disabled={disabled} onClick={onRetry}>
          {retryLabel}
        </ActionButton>
      </ActionGroup>
    </div>
  );
}
