import { useState } from 'react';
import { Linking, ScrollView } from 'react-native';

import { Sheet } from '../chat/sheet';
import { space } from '../design/tokens';
import { Button } from '../primitives/button';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';

export function StatisticsNoticeView({
  visible,
  onClose,
  onSettings,
  onDismissed,
}: {
  visible: boolean;
  onClose(): void;
  onSettings(): void;
  onDismissed?: (() => void) | undefined;
}) {
  const t = useStrings();
  const [expanded, setExpanded] = useState(false);
  const [linkError, setLinkError] = useState(false);
  const open = (url: string) => {
    setLinkError(false);
    void Linking.openURL(url).catch(() => setLinkError(true));
  };
  return (
    <Sheet
      visible={visible}
      label={t.statisticsNoticeTitle}
      title={t.statisticsNoticeTitle}
      onClose={onClose}
      onDismissed={onDismissed}
    >
      <ScrollView nestedScrollEnabled contentContainerStyle={{ padding: space.x5, gap: space.x4 }}>
        <Text>{t.statisticsNoticeSummary}</Text>
        <Button
          on="sheet"
          label={expanded ? t.statisticsHideDetails : t.statisticsDetails}
          onPress={() => setExpanded(!expanded)}
        />
        {expanded ? (
          <Text variant="meta" tone="muted">
            {t.statisticsNotice}
          </Text>
        ) : null}
        <Button
          on="sheet"
          label={t.statisticsPrivacy}
          onPress={() => open(t.statisticsPrivacyUrl)}
        />
        <Button
          on="sheet"
          label={t.statisticsSource}
          onPress={() => open('https://github.com/BotHarness/DeepSeekBot/tree/main/apps/mobile')}
        />
        {linkError ? <Text tone="danger">{t.statisticsLinkError}</Text> : null}
        <Button on="sheet" label={t.statisticsOpenSettings} onPress={onSettings} />
        <Button on="sheet" label={t.statisticsGotIt} tone="primary" onPress={onClose} />
      </ScrollView>
    </Sheet>
  );
}
