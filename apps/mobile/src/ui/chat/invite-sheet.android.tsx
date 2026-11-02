import { BotAvatar } from '../bot-avatar';
import { radius } from '../design/tokens';
import { useDesignTheme } from '../design/theme';
import { useStrings } from '../strings';
import { BotPickerSheet } from './bot-picker-sheet';
import { useInviteSelection, type InviteSheetProps } from './invite-selection';

export function InviteSheet(props: InviteSheetProps) {
  const t = useStrings();
  const theme = useDesignTheme();
  const draft = useInviteSelection(props);
  return (
    <BotPickerSheet
      title={t.groupInvite}
      mount={draft.mount}
      candidates={draft.eligible}
      selected={draft.selected}
      busy={draft.busy}
      error={draft.error}
      canConfirm={draft.canConfirm}
      onToggle={draft.toggle}
      onConfirm={draft.confirm}
      onClose={props.onClose}
      renderLeading={(bot) => (
        <BotAvatar bot={bot} size={theme.touch} ring={false} corner={radius.sm} />
      )}
    />
  );
}
