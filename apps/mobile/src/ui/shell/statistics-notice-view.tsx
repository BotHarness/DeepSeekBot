import { useState } from 'react';
import { Linking, ScrollView } from 'react-native';

import { Sheet } from '../chat/sheet';
import { space } from '../design/tokens';
import { Button } from '../primitives/button';
import { Text } from '../primitives/text';
import { t } from '../strings';

export function StatisticsNoticeView({
  visible,
  onClose,
  onSettings,
}: {
  visible: boolean;
  onClose(): void;
  onSettings(): void;
}) {
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
    >
      <ScrollView contentContainerStyle={{ padding: space.x5, gap: space.x4 }}>
        <Text>{t.statisticsNoticeSummary}</Text>
        <Button
          on="canvas"
          label={expanded ? t.statisticsHideDetails : t.statisticsDetails}
          onPress={() => setExpanded(!expanded)}
        />
        {expanded ? (
          <Text variant="meta" tone="muted">
            {t.statisticsNotice}
          </Text>
        ) : null}
        <Button
          on="canvas"
          label={t.statisticsPrivacy}
          onPress={() => open(t.statisticsPrivacyUrl)}
        />
        <Button
          on="canvas"
          label={t.statisticsSource}
          onPress={() => open('https://github.com/BotHarness/DeepSeekBot/tree/main/apps/mobile')}
        />
        {linkError ? <Text tone="danger">{t.statisticsLinkError}</Text> : null}
        <Button on="canvas" label={t.statisticsOpenSettings} onPress={onSettings} />
        <Button on="canvas" label={t.statisticsGotIt} tone="primary" onPress={onClose} />
      </ScrollView>
    </Sheet>
  );
}
