import { HeaderCircleButton } from '../../ui/chat/header-chrome';
import { useDesignTheme } from '../../ui/design/theme';
import { MenuIcon } from '../../ui/shell/icons';
import { useStrings } from '../../ui/strings';
import { openSessionDrawer } from './session-drawer-state';

export function SessionDrawerButton() {
  const t = useStrings().hostSessions;
  const theme = useDesignTheme();
  return (
    <HeaderCircleButton
      label={t.openDrawer}
      testID="session-drawer-button"
      onPress={openSessionDrawer}
    >
      <MenuIcon color={theme.color.fg} size={theme.type.title.line} />
    </HeaderCircleButton>
  );
}
