import { forwardRef, type ButtonHTMLAttributes } from 'react';

export const InlineTokenButton = forwardRef<
  HTMLButtonElement,
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'>
>(function InlineTokenButton({ className, ...props }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      className={`bh-inline-mention bh-inline-mention-sent bh-inline-mention-link${className === undefined ? '' : ` ${className}`}`}
      {...props}
    />
  );
});
