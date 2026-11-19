import * as stylex from '@stylexjs/stylex';
import type { ReactElement, ReactNode } from 'react';

import { useMountedResource } from '../mounted-resource.js';
import { Dialog } from './dialog.js';
import { Icon } from './icon.js';
import { IconButton } from './icon-button.js';
import { edge, ink, line, space, type } from './tobs.stylex.js';

const styles = stylex.create({
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: space.x3,
    paddingTop: space.x5,
    paddingInline: space.x5,
  },
  heading: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x1,
    flex: '1 1 auto',
    minWidth: 0,
  },
  title: {
    margin: 0,
    color: ink.primary,
    fontSize: type.titleSize,
    lineHeight: type.titleLine,
    fontWeight: type.titleWeight,
    overflowWrap: 'anywhere',
  },
  description: {
    margin: 0,
    color: ink.secondary,
    fontSize: type.bodySize,
    lineHeight: type.bodyLine,
    overflowWrap: 'anywhere',
  },
  body: {
    display: 'flex',
    flexDirection: 'column',
    flex: '1 1 auto',
    minHeight: 0,
    overflow: 'auto',
    padding: space.x5,
  },
  headless: { display: 'flex', flexDirection: 'column', flex: '1 1 auto', minHeight: 0 },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: space.x2,
    paddingBlock: space.x4,
    paddingInline: space.x5,
    borderTopWidth: edge.hairline,
    borderTopStyle: 'solid',
    borderTopColor: line.divider,
  },
});

interface ModalBaseProps {
  open: boolean;
  animate?: boolean | undefined;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
  contentClassName?: string;
  backdropBlur?: boolean;
}

export type ModalProps = ModalBaseProps &
  ({ headless: true; closeLabel?: never } | { headless?: false; closeLabel: string });

function focusFirst(node: HTMLElement): void {
  window.requestAnimationFrame(() => {
    const active = node.ownerDocument.activeElement;
    if (active instanceof HTMLElement && active !== node && node.contains(active)) return;
    const target =
      node.querySelector<HTMLElement>('[data-modal-autofocus]') ??
      node.querySelector<HTMLElement>(
        'input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
    target?.focus();
  });
}

export function Modal(props: ModalProps): ReactElement | null {
  const { open, onClose, title, description, children, footer, className, contentClassName } =
    props;
  const autofocus = useMountedResource<HTMLDivElement>((node) => focusFirst(node), []);
  if (!open) return null;
  const content = [
    stylex.props(props.headless ? styles.headless : styles.body).className,
    contentClassName,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <Dialog
      open
      animate={props.animate}
      onClose={onClose}
      title={title}
      className={className}
      unsized={className !== undefined && className !== ''}
    >
      {props.headless ? (
        <div ref={autofocus} className={content}>
          {children}
        </div>
      ) : (
        <>
          <div {...stylex.props(styles.header)}>
            <div {...stylex.props(styles.heading)}>
              <h2 {...stylex.props(styles.title)}>{title}</h2>
              {description === undefined ? null : (
                <p {...stylex.props(styles.description)}>{description}</p>
              )}
            </div>
            <IconButton aria-label={props.closeLabel} onClick={onClose}>
              <Icon name="x" />
            </IconButton>
          </div>
          <div ref={autofocus} className={content}>
            {children}
          </div>
          {footer === undefined ? null : <div {...stylex.props(styles.footer)}>{footer}</div>}
        </>
      )}
    </Dialog>
  );
}
