import { useStrings } from '../strings';
import { HeaderAction } from './header-action';
import type { SessionOptionGroup } from './host-session-options';

export type HostSessionOptionsButtonProps = {
  active: boolean;
  groups: readonly SessionOptionGroup[];
  onOpen(): void;
};

export function HostSessionOptionsButton({ active, onOpen }: HostSessionOptionsButtonProps) {
  const t = useStrings().hostSessions;
  return (
    <HeaderAction
      icon="filter"
      label={t.options}
      testID="host-sessions-options"
      active={active}
      onPress={onOpen}
    />
  );
}
