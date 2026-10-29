import { Modal as NativeModal, Menu as NativeMenu } from '@deepseek-ai/dsh-client-ui-primitives';
import type { ComponentProps } from 'react';
import { APPEARANCE_CLASS } from './appearance-scope.js';
export function Modal(props: ComponentProps<typeof NativeModal>) {
  return (
    <NativeModal
      {...props}
      className={[APPEARANCE_CLASS, props.className].filter(Boolean).join(' ')}
    />
  );
}
export function Menu(props: ComponentProps<typeof NativeMenu>) {
  return (
    <NativeMenu
      {...props}
      listClassName={[APPEARANCE_CLASS, props.listClassName].filter(Boolean).join(' ')}
    />
  );
}
