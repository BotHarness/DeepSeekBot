import { FlatList, View } from 'react-native';
import type { InviteSheetProps } from './invite-selection';
import { BotAvatar } from '../bot-avatar';
import { SettingsGroupItem, SettingsRow } from '../primitives/settings-row';
import { useStrings } from '../strings';
import { SystemListSheet } from '../primitives/system-list-sheet';
import { SHEET_GROUP, Sheet, SheetNote } from './sheet';
import { useRef, useState } from 'react';
import { useMounted } from '../mounted';
import { errorText } from '@botharness/host-client/bot-settings';
import { radius } from '../design/tokens';

export function InviteSheet({ candidates, onInvite, onClose }: InviteSheetProps) {
  const t = useStrings();
  const alive = useRef(false);
  const mount = useMounted<unknown>(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const invite = (item: (typeof candidates)[number]) => {
    setBusy(true);
    void onInvite(item)
      .then(() => {
        if (alive.current) onClose();
      })
      .catch((failure: unknown) => {
        if (!alive.current) return;
        setError(`${t.groupFailed} ${errorText(failure)}`);
        setBusy(false);
      });
  };
  if (SystemListSheet !== undefined)
    return (
      <View ref={mount}>
        <SystemListSheet
          visible
          title={t.groupInvite}
          closeLabel={t.close}
          sections={[
            ...(error === undefined
              ? []
              : [
                  {
                    key: 'error',
                    rows: [
                      { kind: 'note' as const, key: 'error', text: error, tone: 'danger' as const },
                    ],
                  },
                ]),
            {
              key: 'candidates',
              rows:
                candidates.length === 0
                  ? [{ kind: 'note' as const, key: 'none', text: t.groupInviteNone }]
                  : candidates.map((item) => ({
                      kind: 'choice' as const,
                      key: item.slug,
                      label: item.displayName,
                      leading: {
                        size: 32,
                        node: <BotAvatar bot={item} size={32} ring={false} corner={radius.sm} />,
                      },
                      accessory: 'add' as const,
                      disabled: busy,
                      onPress: () => invite(item),
                    })),
            },
          ]}
          onClose={onClose}
        />
      </View>
    );
  return (
    <View ref={mount}>
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
                  control={{ kind: 'add' }}
                  {...(busy ? {} : { onPress: () => invite(item) })}
                />
              </SettingsGroupItem>
            )}
          />
        )}
      </Sheet>
    </View>
  );
}
