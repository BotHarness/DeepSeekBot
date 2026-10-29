import type { HeaderActionProps } from './header-glyph';
import { HeaderIconButton } from './header-icon-button';

export function HeaderAction({ icon, label, testID, active, onPress }: HeaderActionProps) {
  return (
    <HeaderIconButton
      icon={icon}
      label={label}
      testID={testID}
      selected={active}
      onPress={onPress}
    />
  );
}
