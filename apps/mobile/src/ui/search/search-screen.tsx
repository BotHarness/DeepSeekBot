import { Stack, router, useIsFocused, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Keyboard, Pressable, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { retainedSearch, useRetainedSearch } from '../../host/native-retained-search';
import { hostSession } from '../../host/host-session';
import type { SearchHit } from '../../host/retained-search';
import { Text } from '../primitives/text';
import { SearchField } from '../primitives/search-field';
import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { useFloatingTabInset } from '../shell/floating-tab-inset';
import { t } from '../strings';

type Row =
  | { kind: 'heading'; label: string; key: string }
  | { kind: 'hit'; hit: SearchHit; key: string };

export function SearchScreen() {
  const snapshot = useRetainedSearch();
  const theme = useDesignTheme();
  const bottom = useFloatingTabInset();
  const [error, setError] = useState<string>();
  const opening = useRef(false);
  const focused = useIsFocused();
  const currentFocus = useRef(focused);
  currentFocus.current = focused;
  const list = useRef<FlatList<Row>>(null);
  const restorePending = useRef(false);
  const restore = useCallback(() => {
    const current = retainedSearch.getSnapshot();
    if (
      !currentFocus.current ||
      !restorePending.current ||
      current.status === 'loading' ||
      !list.current
    )
      return;
    list.current.scrollToOffset({ offset: current.scroll, animated: false });
    restorePending.current = false;
  }, []);
  useFocusEffect(
    useCallback(() => {
      restorePending.current = true;
      retainedSearch.setActive(true);
      const frame = requestAnimationFrame(restore);
      return () => {
        cancelAnimationFrame(frame);
        retainedSearch.setActive(false);
      };
    }, [restore]),
  );
  const cloud = snapshot.scope !== 'all' && !snapshot.scope.startsWith('["computer",');
  const rows: Row[] = [
    ...(snapshot.conversations.length
      ? [
          { kind: 'heading' as const, key: 'conversations', label: t.localSearch.conversations },
          ...snapshot.conversations.map((hit): Row => ({ kind: 'hit', key: hit.key, hit })),
        ]
      : []),
    ...(snapshot.messages.length
      ? [
          { kind: 'heading' as const, key: 'messages', label: t.localSearch.messages },
          ...snapshot.messages.map((hit): Row => ({ kind: 'hit', key: hit.key, hit })),
        ]
      : []),
  ];
  const open = async (hit: SearchHit) => {
    if (opening.current) return;
    opening.current = true;
    setError(undefined);
    Keyboard.dismiss();
    try {
      const ownsInteraction = () =>
        currentFocus.current &&
        retainedSearch.getSnapshot().query === snapshot.query &&
        retainedSearch.getSnapshot().scope === snapshot.scope;
      const result = await retainedSearch.resolve(hit);
      if (!ownsInteraction()) return;
      if (result === 'detached') {
        setError(t.sourceChanged);
        return;
      }
      const paired = () =>
        hostSession
          .getState()
          .hosts.some((h) => h.hostId === hit.source.hostId && h.deviceId === hit.source.deviceId);
      if (
        !paired() ||
        !(await hostSession.switchTo(hit.source.hostId, () => ownsInteraction() && paired())) ||
        !paired()
      ) {
        setError(t.sourceChanged);
        return;
      }
      if (
        !currentFocus.current ||
        retainedSearch.getSnapshot().query !== snapshot.query ||
        retainedSearch.getSnapshot().scope !== snapshot.scope
      )
        return;
      const params = {
        hostId: hit.source.hostId,
        deviceId: hit.source.deviceId,
        retained: '1',
        ...(hit.message ? { focus: hit.message.id } : {}),
      };
      if (hit.target.kind === 'dm')
        router.push({ pathname: '/dm/[slug]', params: { ...params, slug: hit.target.id } });
      else router.push({ pathname: '/channel/[id]', params: { ...params, id: hit.target.id } });
    } catch {
      setError(t.dialogFailed);
    } finally {
      opening.current = false;
    }
  };
  return (
    <>
      <Stack.Screen options={{ title: t.localSearch.title, headerLargeTitleEnabled: false }} />
      <KeyboardAvoidingView
        behavior="padding"
        style={{ flex: 1, backgroundColor: theme.color.base }}
      >
        <SearchField
          value={snapshot.query}
          inset={space.x5}
          placeholder={t.localSearch.placeholder}
          onChangeText={(query) => {
            setError(undefined);
            list.current?.scrollToOffset({ offset: 0, animated: false });
            void retainedSearch.query(query);
          }}
        />
        <View style={{ paddingHorizontal: space.x5, gap: space.x2, paddingBottom: space.x3 }}>
          <Text variant="meta" tone="muted">
            {t.localSearch.coverage}
          </Text>
          {(cloud || snapshot.scope === 'all') && (
            <Text variant="meta" tone="muted">
              {t.localSearch.cloudUnavailable}
            </Text>
          )}
          {snapshot.unavailable.length > 0 && (
            <View style={{ gap: space.x2 }}>
              <Text variant="meta" tone="warning">
                {t.localSearch.unavailable(snapshot.unavailable.join(', '))}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => void retainedSearch.refresh()}
                style={{ minHeight: theme.touch, justifyContent: 'center' }}
              >
                <Text tone="accent">{t.retry}</Text>
              </Pressable>
            </View>
          )}
          {error && <Text tone="warning">{error}</Text>}
        </View>
        <FlatList
          ref={list}
          data={rows}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ paddingBottom: bottom, paddingHorizontal: space.x5 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          keyExtractor={(row) => row.key}
          onScroll={(event) => {
            if (focused && snapshot.status === 'ready')
              retainedSearch.scroll(event.nativeEvent.contentOffset.y);
          }}
          onLayout={restore}
          onContentSizeChange={restore}
          ListEmptyComponent={
            snapshot.status === 'loading' ? (
              <ActivityIndicator />
            ) : (
              <Text tone="muted">{snapshot.query ? t.localSearch.empty : t.localSearch.start}</Text>
            )
          }
          renderItem={({ item }) =>
            item.kind === 'heading' ? (
              <Text strong style={{ paddingVertical: space.x4 }}>
                {item.label}
              </Text>
            ) : (
              <Pressable
                accessibilityRole="button"
                onPress={() => void open(item.hit)}
                style={({ pressed }) => ({
                  minHeight: theme.touch,
                  paddingVertical: space.x4,
                  gap: space.x2,
                  backgroundColor: pressed ? theme.layer.raised.chosen : 'transparent',
                })}
              >
                <Text strong numberOfLines={1}>
                  {item.hit.target.name}
                </Text>
                {item.hit.message && <Text numberOfLines={3}>{item.hit.message.body}</Text>}
                <Text variant="meta" tone="muted" numberOfLines={2}>
                  {item.hit.source.name}
                  {item.hit.message
                    ? ` · ${item.hit.message.author === 'human' ? t.reactionYou : item.hit.message.author} · ${new Date(item.hit.message.at).toLocaleString()}`
                    : ''}
                </Text>
              </Pressable>
            )
          }
        />
      </KeyboardAvoidingView>
    </>
  );
}
