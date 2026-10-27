import { useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { botAccess, setBotAccess, type BotAccess, type BotAccessKind } from '../../host/bot-access';
import { errorText, HostAnswerInvalid } from '../../host/bot-settings';
import type { HostClient, RosterBot } from '../../host/client';
import { useDesignTheme } from '../design/theme';
import { edge, space } from '../design/tokens';
import { RowIcon } from '../primitives/row-icon';
import { SettingsRow, SettingsSection } from '../primitives/settings-row';
import { Text } from '../primitives/text';
import { Toggle } from '../primitives/toggle';
import { useStrings } from '../strings';
import { SHEET_GROUP } from './sheet';

const KINDS: readonly BotAccessKind[] = ['browser', 'computer'];

export function useBotAccessSwitches(client: HostClient, bot: RosterBot) {
  const host = botAccess(bot);
  const [chosen, setChosen] = useState<Partial<BotAccess>>({});
  const [error, setError] = useState<string>();
  const saving = useRef(new Set<BotAccessKind>());
  const settled = KINDS.filter((kind) => chosen[kind] === host[kind] && !saving.current.has(kind));
  if (settled.length > 0)
    setChosen((current) => {
      const next = { ...current };
      for (const kind of settled) delete next[kind];
      return next;
    });
  const value = (kind: BotAccessKind) => chosen[kind] ?? host[kind];
  const change = async (kind: BotAccessKind, enabled: boolean) => {
    if (saving.current.has(kind)) return;
    saving.current.add(kind);
    setError(undefined);
    setChosen((current) => ({ ...current, [kind]: enabled }));
    try {
      const saved = await setBotAccess(client, bot.slug, kind, enabled);
      saving.current.delete(kind);
      setChosen((current) => ({ ...current, [kind]: saved }));
    } catch (failure) {
      saving.current.delete(kind);
      setChosen((current) => {
        const next = { ...current };
        delete next[kind];
        return next;
      });
      setError(failure instanceof HostAnswerInvalid ? '' : errorText(failure));
    }
  };
  return { value, change, error };
}

export function BotAccessScreen({ client, bot }: { client: HostClient; bot: RosterBot }) {
  const t = useStrings();
  const theme = useDesignTheme();
  const access = useBotAccessSwitches(client, bot);
  const copy = t.profilePermissions;
  const row = (kind: BotAccessKind, index: number) => (
    <View
      key={kind}
      style={
        index === 0
          ? undefined
          : {
              borderTopWidth: edge.hairline,
              borderTopColor: theme.layer[SHEET_GROUP].divider,
            }
      }
    >
      <SettingsRow
        on={SHEET_GROUP}
        title={copy[kind]}
        detail={
          kind === 'browser'
            ? copy.browserDetail(bot.displayName)
            : copy.computerDetail(bot.displayName)
        }
        leading={<RowIcon name={kind} />}
        trailing={
          <Toggle
            testID={`bot-access-${kind}`}
            on={SHEET_GROUP}
            label={copy[kind]}
            value={access.value(kind)}
            onChange={(enabled) => void access.change(kind, enabled)}
          />
        }
      />
    </View>
  );
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: theme.overlay.fill }}
      contentContainerStyle={{ padding: space.x5, gap: space.x4 }}
    >
      <SettingsSection on={SHEET_GROUP}>{KINDS.map(row)}</SettingsSection>
      {access.error === undefined ? null : (
        <Text accessibilityRole="alert" tone="danger">
          {access.error === '' ? copy.accessRetry : copy.accessFailed(access.error)}
        </Text>
      )}
    </ScrollView>
  );
}
