import { FlatList } from 'react-native';
import type { InviteSheetProps } from './invite-selection';
import { useDesignTheme } from '../design/theme';
import { BotAvatar } from '../bot-avatar';
import { SettingsGroupItem, SettingsRow } from '../primitives/settings-row';
import { PlusIcon } from '../shell/icons';
import { t } from '../strings';
import { SHEET_GROUP, Sheet, SheetNote } from './sheet';
import { useState } from 'react';
import { errorText } from '../../host/bot-settings';
import { radius } from '../design/tokens';

/** iOS retains its existing one-at-a-time invitation flow. */
export function InviteSheet({ candidates, onInvite, onClose }: InviteSheetProps) {
  const theme = useDesignTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <Sheet visible label={t.groupInvite} title={t.groupInvite} onClose={onClose}>
      {error === undefined ? null : <SheetNote tone="danger">{error}</SheetNote>}
      {candidates.length === 0 ? (
        <SheetNote>{t.groupInviteNone}</SheetNote>
      ) : (
        <FlatList
          data={candidates}
          keyExtractor={(bot) => bot.slug}
          renderItem={({ item, index }) => (
            <SettingsGroupItem
              first={index === 0}
              last={index === candidates.length - 1}
              on={SHEET_GROUP}
            >
              <SettingsRow
                title={item.displayName}
                on={SHEET_GROUP}
                leading={<BotAvatar bot={item} size={32} ring={false} corner={radius.sm} />}
                trailing={<PlusIcon color={theme.color.muted} size={20} />}
                onPress={
                  busy
                    ? undefined
                    : () => {
                        setBusy(true);
                        void onInvite(item)
                          .then(onClose)
                          .catch((failure: unknown) => {
                            setError(`${t.groupFailed} ${errorText(failure)}`);
                            setBusy(false);
                          });
                      }
                }
              />
            </SettingsGroupItem>
          )}
        />
      )}
    </Sheet>
  );
}
