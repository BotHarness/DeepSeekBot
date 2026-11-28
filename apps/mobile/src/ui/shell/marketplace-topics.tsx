import { FlatList, View, type ViewInstance } from 'react-native';
import type { CatalogueResource } from '../../marketplace/catalogue';
import { marketplace, useCatalogueResource } from '../../marketplace/native-catalogue';
import { SHEET_GROUP, Sheet, SheetActions, SheetNote } from '../chat/sheet';
import { space } from '../design/tokens';
import { useMounted } from '../mounted';
import { Button } from '../primitives/button';
import { CheckmarkRow } from '../primitives/checkmark-row';
import { LoadingIndicator } from '../primitives/loading-indicator';
import { SystemListSheet, type SystemListRow } from '../primitives/system-list-sheet';
import { useStrings } from '../strings';

export function MarketplaceTopics({
  visible,
  value,
  onChange,
  onClose,
  resource = marketplace.topics,
  title,
  allLabel,
  testIDPrefix = 'marketplace-topic',
}: {
  visible: boolean;
  value: string;
  onChange(value: string): void;
  onClose(): void;
  resource?: CatalogueResource<{ topic: string; count: number }[]>;
  title?: string;
  allLabel?: string;
  testIDPrefix?: string;
}) {
  const t = useStrings();
  const all = allLabel ?? t.marketplace.allTopics;
  const heading = title ?? t.marketplace.topics;
  const state = useCatalogueResource(resource);
  const mounted = useMounted<ViewInstance>(() => {
    void resource.refresh();
  }, [resource]);
  const topics = [{ topic: '', count: 0 }, ...(state.value ?? [])];
  const label = (item: { topic: string; count: number }) =>
    item.topic ? `${item.topic} (${item.count})` : all;
  const testID = (item: { topic: string }) => `${testIDPrefix}-${item.topic || 'all'}`;
  const refresh = visible ? <View ref={mounted} /> : null;
  if (SystemListSheet !== undefined) {
    const status: SystemListRow[] = state.busy
      ? [{ kind: 'progress', key: 'loading', label: t.marketplace.loading }]
      : state.error
        ? [
            { kind: 'note', key: 'error', text: t.marketplace.unavailable, tone: 'danger' },
            {
              kind: 'action',
              key: 'retry',
              label: t.marketplace.retry,
              onPress: () => void resource.refresh(),
            },
          ]
        : [];
    return (
      <>
        {refresh}
        <SystemListSheet
          visible={visible}
          title={heading}
          closeLabel={t.close}
          onClose={onClose}
          sections={[
            ...(status.length === 0 ? [] : [{ key: 'status', rows: status }]),
            {
              key: 'topics',
              rows: topics.map((item) => ({
                kind: 'choice' as const,
                key: item.topic ? `topic:${item.topic}` : 'all',
                testID: testID(item),
                label: label(item),
                selected: item.topic === value,
                onPress: () => onChange(item.topic),
              })),
            },
          ]}
        />
      </>
    );
  }
  return (
    <Sheet visible={visible} label={heading} title={heading} onClose={onClose} resizable>
      {refresh}
      {state.busy ? <LoadingIndicator accessibilityLabel={t.marketplace.loading} /> : null}
      {state.error ? (
        <>
          <SheetNote tone="danger">{t.marketplace.unavailable}</SheetNote>
          <SheetActions>
            <Button
              testID={`${testIDPrefix}s-retry`}
              label={t.marketplace.retry}
              on={SHEET_GROUP}
              onPress={() => void resource.refresh()}
            />
          </SheetActions>
        </>
      ) : null}
      <FlatList
        nestedScrollEnabled
        testID={`${testIDPrefix}-list`}
        data={topics}
        keyExtractor={(item) => item.topic}
        style={{ flexShrink: 1 }}
        contentContainerStyle={{ paddingTop: space.x3 }}
        renderItem={({ item }) => (
          <CheckmarkRow
            testID={testID(item)}
            label={label(item)}
            selected={item.topic === value}
            onPress={() => onChange(item.topic)}
          />
        )}
      />
    </Sheet>
  );
}
