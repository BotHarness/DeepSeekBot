import { Modal as NativeModal, Menu as NativeMenu } from '@deepseek-ai/dsh-client-ui-primitives';
import type { ComponentProps, RefObject } from 'react';
import { APPEARANCE_CLASS } from './appearance-scope.js';
export function Modal(props: ComponentProps<typeof NativeModal>) {
  return (
    <NativeModal
      {...props}
      className={[APPEARANCE_CLASS, props.className].filter(Boolean).join(' ')}
    />
  );
}
type MenuProps = Omit<ComponentProps<typeof NativeMenu>, 'getAnchorRect'> & {
  anchorRef?: RefObject<HTMLElement | null>;
};

export function Menu(props: MenuProps) {
  const { anchorRef } = props;
  const legacyAnchor =
    anchorRef === undefined
      ? {}
      : {
          getAnchorRect: () => anchorRef.current?.getBoundingClientRect() ?? null,
        };
  return (
    <NativeMenu
      {...props}
      {...legacyAnchor}
      listClassName={[APPEARANCE_CLASS, props.listClassName].filter(Boolean).join(' ')}
    />
  );
}
