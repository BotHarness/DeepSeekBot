import { useRef, useState } from 'react';
import { NavigationAction } from './navigation-action';
import { CreationPanel } from './creation-panel';
import type { CreationPanelProps } from './creation-menu';
import { haptic } from '../haptics';
import { t } from '../strings';

export type CreationMenuButtonProps = Pick<
  CreationPanelProps,
  'scope' | 'targets' | 'size' | 'busy' | 'onPick'
>;

export function CreationMenuButton(props: CreationMenuButtonProps) {
  const [open, setOpen] = useState(false);
  const opened = useRef(false);
  const close = () => {
    opened.current = false;
    setOpen(false);
  };
  return (
    <>
      <NavigationAction
        size={props.size}
        label={t.createHere}
        onPress={() => {
          if (opened.current) return;
          opened.current = true;
          haptic('menu');
          setOpen(true);
        }}
      />
      {open && (
        <CreationPanel
          {...props}
          bottom={props.size}
          onClose={close}
          onPick={(action, target) => {
            close();
            props.onPick(action, target);
          }}
        />
      )}
    </>
  );
}
