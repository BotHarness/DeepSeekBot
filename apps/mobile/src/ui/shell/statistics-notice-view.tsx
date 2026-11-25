import { useState } from 'react';
import { Linking, ScrollView } from 'react-native';

import { Sheet } from '../chat/sheet';
import { space } from '../design/tokens';
import { Button } from '../primitives/button';
import { SystemListSheet } from '../primitives/system-list-sheet';
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
  const source = 'https://github.com/BotHarness/DeepSeekBot/tree/main/apps/mobile';
  if (SystemListSheet !== undefined)
    return (
      <SystemListSheet
        visible={visible}
        title={t.statisticsNoticeTitle}
        closeLabel={t.close}
        confirm={{ label: t.statisticsGotIt, onPress: onClose }}
        onClose={onClose}
        onDismissed={onDismissed}
        sections={[
          {
            key: 'summary',
            ...(expanded ? { footer: t.statisticsNotice } : {}),
            rows: [
              { kind: 'note', key: 'summary', text: t.statisticsNoticeSummary, tone: 'label' },
              {
                kind: 'action',
                key: 'details',
                label: expanded ? t.statisticsHideDetails : t.statisticsDetails,
                onPress: () => setExpanded(!expanded),
              },
            ],
          },
          {
            key: 'links',
            rows: [
              {
                kind: 'action',
                key: 'privacy',
                label: t.statisticsPrivacy,
                onPress: () => open(t.statisticsPrivacyUrl),
              },
              {
                kind: 'action',
                key: 'source',
                label: t.statisticsSource,
                onPress: () => open(source),
              },
              ...(linkError
                ? [
                    {
                      kind: 'note' as const,
                      key: 'link-error',
                      text: t.statisticsLinkError,
                      tone: 'danger' as const,
                    },
                  ]
                : []),
            ],
          },
          {
            key: 'settings',
            rows: [
              {
                kind: 'action',
                key: 'settings',
                label: t.statisticsOpenSettings,
                onPress: onSettings,
              },
            ],
          },
        ]}
      />
    );
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
        <Button on="sheet" label={t.statisticsSource} onPress={() => open(source)} />
        {linkError ? <Text tone="danger">{t.statisticsLinkError}</Text> : null}
        <Button on="sheet" label={t.statisticsOpenSettings} onPress={onSettings} />
        <Button on="sheet" label={t.statisticsGotIt} tone="primary" onPress={onClose} />
      </ScrollView>
    </Sheet>
  );
}
