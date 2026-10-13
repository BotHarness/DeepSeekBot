import type { ReactElement, ReactNode, Ref } from 'react';
import * as stylex from '@stylexjs/stylex';

import { Modal } from '../modal.js';
import type { DialogSize } from './form-dialog.js';
import { color, dialog, space, text } from './tokens.stylex.js';

const styles = stylex.create({
  small: { width: dialog.small, maxWidth: '100%' },
  standard: { width: dialog.standard, maxWidth: '100%' },
  medium: { width: dialog.medium, maxWidth: '100%' },
  wide: { width: dialog.wide, maxWidth: '100%' },
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x4,
    minWidth: 0,
    margin: 0,
    color: color.fg,
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
  },
  scroll: { maxHeight: dialog.bodyMax, overflowY: 'auto', overscrollBehavior: 'contain' },
  fill: { maxHeight: '100%' },
  fillContent: { minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain' },
  footer: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: space.x3,
    width: '100%',
  },
  spacer: { flexGrow: 1 },
});

export function PanelDialog({
  title,
  description,
  size = 'standard',
  closeLabel,
  onClose,
  actions,
  secondary,
  scroll = false,
  fill = false,
  data,
  bodyRef,
  children,
}: {
  readonly title: string;
  readonly description?: string | undefined;
  readonly size?: DialogSize;
  readonly closeLabel: string;
  readonly onClose: () => void;
  readonly actions?: ReactNode;
  readonly secondary?: ReactNode;
  readonly scroll?: boolean;
  readonly fill?: boolean;
  readonly data?: Readonly<Record<`data-${string}`, string>>;
  readonly bodyRef?: Ref<HTMLDivElement>;
  readonly children?: ReactNode;
}): ReactElement {
  const footer =
    actions === undefined && secondary === undefined ? undefined : (
      <div {...stylex.props(styles.footer)}>
        {secondary === undefined ? null : (
          <>
            {secondary}
            <span {...stylex.props(styles.spacer)} />
          </>
        )}
        {actions}
      </div>
    );
  return (
    <Modal
      open
      onClose={onClose}
      closeLabel={closeLabel}
      title={title}
      {...(description === undefined ? {} : { description })}
      {...(footer === undefined ? {} : { footer })}
      className={stylex.props(styles[size], fill && styles.fill).className ?? ''}
      {...(fill ? { contentClassName: stylex.props(styles.fillContent).className ?? '' } : {})}
    >
      <div ref={bodyRef} {...data} {...stylex.props(styles.body, scroll && styles.scroll)}>
        {children}
      </div>
    </Modal>
  );
}
