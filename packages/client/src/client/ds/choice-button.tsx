import { forwardRef, type ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';

import { ChannelSidebarIcon } from '../channel-sidebar-icon.js';
import { color, space, text } from './tokens.stylex.js';

const styles = stylex.create({
  choice: {
    width: '100%',
    height: 'auto',
    justifyContent: 'space-between',
    paddingBlock: space.x4,
    whiteSpace: 'normal',
    textAlign: 'start',
    gap: space.x4,
  },
  copy: { display: 'flex', flexDirection: 'column', gap: space.x1, minWidth: 0, flexGrow: 1 },
  description: {
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    fontWeight: text.regular,
  },
});

export interface ChoiceButtonProps {
  readonly title: string;
  readonly description?: ReactNode;
  readonly leading?: ReactNode;
  readonly disabled?: boolean;
  readonly onClick: () => void;
  readonly data?: Readonly<Record<`data-${string}`, string>>;
}

export const ChoiceButton = forwardRef<HTMLButtonElement, ChoiceButtonProps>(function ChoiceButton(
  { title, description, leading, disabled, onClick, data, ...forwarded },
  ref,
) {
  return (
    <Button
      {...forwarded}
      {...data}
      ref={ref}
      variant="outline"
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      {...stylex.props(styles.choice)}
    >
      {leading}
      <span {...stylex.props(styles.copy)}>
        <span>{title}</span>
        {description === undefined ? null : (
          <span {...stylex.props(styles.description)}>{description}</span>
        )}
      </span>
      <ChannelSidebarIcon name="chevron-right" />
    </Button>
  );
});
