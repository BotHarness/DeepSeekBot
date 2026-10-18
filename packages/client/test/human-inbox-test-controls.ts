import { createElement, type ReactElement, type ReactNode } from 'react';

export function Menu({
  open,
  anchor,
  items = [],
  selectedId,
  onSelect,
}: {
  open: boolean;
  anchor: ReactNode;
  items?: readonly { id: string; label: ReactNode }[];
  selectedId?: string;
  onSelect?: (id: string) => void;
}): ReactElement {
  return createElement(
    'span',
    null,
    anchor,
    open
      ? createElement(
          'div',
          { role: 'menu' },
          ...items.map((item) =>
            createElement(
              'button',
              {
                key: item.id,
                role: 'menuitemradio',
                'aria-checked': item.id === selectedId,
                onClick: () => onSelect?.(item.id),
              },
              item.label,
            ),
          ),
        )
      : null,
  );
}
export const Tooltip = ({ children }: { children: ReactElement }): ReactElement => children;
export const IconChevronDownOutlineRegular = (): ReactElement =>
  createElement('svg', { 'aria-hidden': true });
export const IconRightUpOutlineRegular = ({ className }: { className?: string }): ReactElement =>
  createElement('svg', { className, 'aria-hidden': true });

export const Modal = ({
  open,
  children,
  footer,
  className,
}: {
  open: boolean;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
}): ReactElement | null =>
  open ? createElement('div', { role: 'dialog', className }, children, footer) : null;

export const IconEllipsisOutlineRegular = (): ReactElement =>
  createElement('svg', { 'aria-hidden': true });

export const IconCloseOutlineRegular = (): ReactElement =>
  createElement('svg', { 'aria-hidden': true });

export const IconSearchOutlineRegular = () => createElement('svg');
export const IconCloseFillRegular = () => createElement('svg');
export const IconChevronDownOutlineMedium = () => createElement('svg');
export const IconChevronRightOutlineMedium = () => createElement('svg');
