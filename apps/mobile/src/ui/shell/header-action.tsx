import { HeaderGlyph, type HeaderActionProps } from './header-glyph';
import { HeaderIconButton } from './header-icon-button';

export function HeaderAction({ icon, label, testID, onPress }: HeaderActionProps) {
  return (
    <HeaderIconButton label={label} testID={testID} onPress={onPress}>
      <HeaderGlyph icon={icon} />
    </HeaderIconButton>
  );
}
