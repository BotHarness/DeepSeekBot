import { HeaderGlyph, type HeaderActionProps } from './header-glyph';
import { HeaderIconButton } from './header-icon-button';

export function HeaderAction({ icon, label, testID, active, onPress }: HeaderActionProps) {
  return (
    <HeaderIconButton label={label} testID={testID} selected={active} onPress={onPress}>
      <HeaderGlyph icon={icon} active={active === true} />
    </HeaderIconButton>
  );
}
