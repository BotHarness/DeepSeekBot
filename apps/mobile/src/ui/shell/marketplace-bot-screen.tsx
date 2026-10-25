import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ScrollView, View, type ViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { botCreation } from '../../host/native-bot-creation';
import { selectMarketplaceImport } from '../../marketplace/import-selection';
import { marketplace, useCatalogueResource } from '../../marketplace/native-catalogue';
import { space } from '../design/tokens';
import { useMounted } from '../mounted';
import { Button } from '../primitives/button';
import { LoadingIndicator } from '../primitives/loading-indicator';
import { PullToRefresh } from '../primitives/pull-to-refresh';
import { Text } from '../primitives/text';
import { useStrings, locale } from '../strings';
import { creationError } from './bot-creation-copy';
import { MarketplaceDetail } from './marketplace-detail';

export function MarketplaceBotScreen() {
  const t = useStrings();
  const { id, hostId, entry } = useLocalSearchParams<{
    id?: string;
    hostId?: string;
    entry?: string;
  }>();
  const resource = marketplace.detail(id ?? '', locale);
  const state = useCatalogueResource(resource);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const importing = useRef(false);
  const visible = useRef(false);
  const insets = useSafeAreaInsets();
  const mounted = useMounted<ViewInstance>(() => {
    if (id) void resource.refresh();
  }, [id, resource]);
  useFocusEffect(
    useCallback(() => {
      visible.current = true;
      return () => {
        visible.current = false;
      };
    }, []),
  );
  const importBot = async () => {
    const latest = resource.getSnapshot();
    if (importing.current || latest.busy || latest.error || !latest.value) return;
    importing.current = true;
    setBusy(true);
    const error = await selectMarketplaceImport(
      botCreation,
      latest.value,
      entry === 'refresh'
        ? { kind: 'refresh' }
        : entry === 'host' && hostId
          ? { kind: 'host', hostId }
          : { kind: 'all' },
    );
    importing.current = false;
    setBusy(false);
    setError(error);
    if (!error && visible.current)
      router.push({ pathname: '/create-bot', params: { entry: 'resume' } });
  };
  const loadError = !id ? 'bot-not-found' : state.error;
  return (
    <View ref={mounted} style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          title: state.value?.bot.displayName ?? state.value?.bot.name ?? t.marketplace.title,
        }}
      />
      <PullToRefresh
        refreshing={state.busy && state.value !== undefined}
        onRefresh={() => void resource.refresh()}
      >
        {(scroll) => (
          <ScrollView
            {...scroll}
            contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={{
              padding: space.x5,
              paddingBottom: insets.bottom + space.x5,
              gap: space.x5,
            }}
          >
            {loadError ? (
              <Text accessibilityRole="alert">
                {loadError === 'bot-not-found' ? t.marketplace.missing : t.marketplace.unavailable}
              </Text>
            ) : null}
            {error ? (
              <Text accessibilityRole="alert">
                {error === 'creation-pending'
                  ? t.marketplace.pending
                  : error === 'marketplace-version-unavailable'
                    ? t.marketplace.refreshRevision
                    : creationError(error)}
              </Text>
            ) : null}
            {error === 'creation-pending' ? (
              <Button
                label={t.marketplace.resume}
                testID="marketplace-resume-creation"
                onPress={() =>
                  router.push({ pathname: '/create-bot', params: { entry: 'resume' } })
                }
              />
            ) : null}
            {state.busy && !state.value ? (
              <LoadingIndicator accessibilityLabel={t.marketplace.loading} />
            ) : null}
            {state.value ? (
              <MarketplaceDetail
                detail={state.value}
                busy={busy}
                disabled={state.busy || !!loadError || !state.value.commitSha}
                onImport={() => void importBot()}
              />
            ) : null}
            {id ? (
              <Button
                testID="marketplace-detail-refresh"
                label={t.marketplace.refreshListing}
                busy={state.busy}
                onPress={() => void resource.refresh()}
              />
            ) : null}
          </ScrollView>
        )}
      </PullToRefresh>
    </View>
  );
}
