import { useState } from 'react';
import { HeaderAction } from '../../ui/shell/header-action';
import {
  HostSessionOptionsSheet,
  type SessionOptionGroup,
} from '../../ui/shell/host-session-options';
import { useStrings } from '../../ui/strings';

export type SessionOptionsMenuProps = {
  active: boolean;
  groups: readonly SessionOptionGroup[];
};

export function SessionOptionsMenu({ active, groups }: SessionOptionsMenuProps) {
  const t = useStrings().hostSessions;
  const [open, setOpen] = useState(false);
  return (
    <>
      <HeaderAction
        icon="filter"
        label={t.options}
        testID="session-drawer-options"
        active={active}
        onPress={() => setOpen(true)}
      />
      <HostSessionOptionsSheet open={open} groups={groups} onClose={() => setOpen(false)} />
    </>
  );
}
