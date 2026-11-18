import { forwardRef, type ButtonHTMLAttributes } from 'react';

export const MenuRowButton = forwardRef<
  HTMLButtonElement,
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'>
>(function MenuRowButton(props, ref) {
  return <button ref={ref} type="button" role="menuitem" {...props} />;
});
