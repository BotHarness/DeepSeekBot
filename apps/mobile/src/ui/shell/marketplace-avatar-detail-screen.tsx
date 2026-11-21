import { Stack, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { FlatList, View, type ViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { MarketplaceAvatarApplyCandidate } from '@botharness/host-protocol/marketplace-avatar';
import { useHostSession } from '../../host/host-session';
import { marketplaceAvatars, type MarketplaceAvatars } from '../../marketplace/avatars';
import { BotPortrait } from '../bot-avatar';
import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { useMounted } from '../mounted';
import { Button } from '../primitives/button';
import { CreationField } from '../primitives/creation-field';
import { KeyboardFormScroll } from '../primitives/keyboard-form';
import { SettingsRow } from '../primitives/settings-row';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';
import { useAvatarAction } from './marketplace-avatar-action';
import {
  AvatarLoadState,
  MarketplaceAvatarImage,
  useAvatarResource,
} from './marketplace-avatar-parts';

export function MarketplaceAvatarDetailScreen() {
  const { id, hostId } = useLocalSearchParams<{ id?: string; hostId?: string }>();
  const { client, saved } = useHostSession(hostId);
  const copy = useStrings().marketplaceAvatars;
  return client && saved && hostId && id ? (
    <AvatarDetail key={`${hostId}:${id}`} id={id} actions={marketplaceAvatars(client)} />
  ) : (
    <>
      <Stack.Screen options={{ title: copy.title }} />
      <View style={{ padding: space.x5 }}>
        <Text>{copy.pair}</Text>
      </View>
    </>
  );
}

function AvatarDetail({ actions, id }: { actions: MarketplaceAvatars; id: string }) {
  const t = useStrings();
  const copy = t.marketplaceAvatars;
  const resource = actions.detail(id);
  const state = useAvatarResource(resource);
  const avatar = state.error ? undefined : state.value;
  const [mode, setMode] = useState<'detail' | 'pick' | 'report'>('detail');
  const [status, setStatus] = useState<string>();
  const insets = useSafeAreaInsets();
  return (
    <>
      <Stack.Screen
        options={{ title: mode === 'pick' ? copy.candidates : (avatar?.name ?? copy.title) }}
      />
      {mode === 'pick' ? (
        <ApplyCandidates
          actions={actions}
          id={id}
          onClose={() => setMode('detail')}
          onApplied={(name) => {
            setStatus(copy.applied(name));
            setMode('detail');
            void resource.refresh();
          }}
        />
      ) : (
        <KeyboardFormScroll
          contentContainerStyle={{
            padding: space.x5,
            paddingBottom: insets.bottom + space.x5,
            gap: space.x4,
          }}
        >
          <AvatarLoadState
            error={state.error}
            loading={state.busy && !state.value}
            onRetry={() => void resource.refresh()}
          />
          {status ? <Text accessibilityRole="alert">{status}</Text> : null}
          {avatar ? (
            <>
              <MarketplaceAvatarImage uri={avatar.imageUrl} />
              <Text variant="title" strong selectable>
                {avatar.name}
              </Text>
              <Text tone="muted" selectable>
                {copy.author(avatar.author.name, avatar.author.id)}
              </Text>
              {avatar.description ? <Text selectable>{avatar.description}</Text> : null}
              {avatar.tags.length ? <Text tone="muted">{avatar.tags.join(' · ')}</Text> : null}
              <Text tone="muted">{copy.count(avatar.applyCount)}</Text>
              {mode === 'report' ? (
                <AvatarReport
                  actions={actions}
                  id={id}
                  onClose={() => setMode('detail')}
                  onReported={() => {
                    setStatus(copy.reported);
                    setMode('detail');
                    void resource.refresh();
                  }}
                />
              ) : (
                <>
                  <Button
                    label={copy.apply}
                    tone="primary"
                    testID="marketplace-avatar-apply"
                    disabled={state.busy}
                    onPress={() => setMode('pick')}
                  />
                  <Button
                    label={copy.report}
                    testID="marketplace-avatar-report"
                    disabled={state.busy}
                    onPress={() => setMode('report')}
                  />
                </>
              )}
            </>
          ) : null}
        </KeyboardFormScroll>
      )}
    </>
  );
}

function ApplyCandidates({
  actions,
  id,
  onApplied,
  onClose,
}: {
  actions: MarketplaceAvatars;
  id: string;
  onApplied(name: string): void;
  onClose(): void;
}) {
  const t = useStrings();
  const copy = t.marketplaceAvatars;
  const theme = useDesignTheme();
  const list = useAvatarResource(actions.candidates);
  const action = useAvatarAction();
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<string>();
  const bot =
    list.error || list.busy ? undefined : list.value?.find((item) => item.slug === selected);
  const apply = (target: MarketplaceAvatarApplyCandidate) =>
    void action.run(
      async () => {
        await actions.apply(id, target.slug);
        onApplied(target.displayName);
      },
      () => t.dialogFailed,
    );
  return (
    <View style={{ flex: 1 }}>
      <FlatList
        style={{ flex: 1 }}
        data={list.error || list.busy ? [] : (list.value ?? [])}
        keyExtractor={(item) => item.slug}
        contentContainerStyle={{ padding: space.x5, gap: space.x3 }}
        ListHeaderComponent={
          <View style={{ gap: space.x3 }}>
            <Text variant="title" strong accessibilityRole="header">
              {copy.candidates}
            </Text>
            <AvatarLoadState
              error={list.error}
              loading={list.busy}
              onRetry={() => void actions.candidates.refresh()}
            />
          </View>
        }
        ListEmptyComponent={
          list.status === 'ready' && !list.error && !list.busy ? (
            <Text>{copy.noCandidates}</Text>
          ) : (
            <></>
          )
        }
        renderItem={({ item }) => {
          const chosen = item.slug === selected;
          const avatar = item.avatar;
          const portrait = {
            slug: item.slug,
            displayName: item.displayName,
            ...(item.avatarSeed === undefined ? {} : { avatarSeed: item.avatarSeed }),
            ...(avatar?.startsWith('/') && !avatar.startsWith('//')
              ? { avatarSource: actions.avatarResource(avatar) }
              : avatar && /^(https?:\/\/|data:image\/)/u.test(avatar)
                ? { avatarUrl: avatar }
                : {}),
          };
          return (
            <SettingsRow
              title={item.displayName}
              on="raised"
              leading={
                <BotPortrait bot={portrait} size={theme.touch - space.x4} corner={radius.sm} />
              }
              strong={chosen}
              selected={chosen}
              control={chosen ? { kind: 'check' } : undefined}
              testID={`marketplace-avatar-target-${item.slug}`}
              onPress={action.busy ? undefined : () => setSelected(item.slug)}
            />
          );
        }}
      />
      <View style={{ padding: space.x5, paddingBottom: insets.bottom + space.x5, gap: space.x3 }}>
        {action.error ? (
          <Text tone="danger" accessibilityRole="alert">
            {action.error}
          </Text>
        ) : null}
        {bot?.hasAppearance ? <Text accessibilityRole="alert">{copy.applyWarning}</Text> : null}
        <Button
          label={copy.apply}
          tone="primary"
          testID="marketplace-avatar-confirm-apply"
          busy={action.busy}
          disabled={!bot}
          onPress={() => {
            if (bot) apply(bot);
          }}
        />
        <Button label={t.cancel} disabled={action.busy} onPress={onClose} />
      </View>
    </View>
  );
}

function AvatarReport({
  actions,
  id,
  onClose,
  onReported,
}: {
  actions: MarketplaceAvatars;
  id: string;
  onClose(): void;
  onReported(): void;
}) {
  const t = useStrings();
  const copy = t.marketplaceAvatars;
  const [reason, setReason] = useState('');
  const action = useAvatarAction();
  const report = useRef<AbortController>(undefined);
  const mount = useMounted<ViewInstance>(() => () => report.current?.abort(), []);
  return (
    <View ref={mount} style={{ gap: space.x3 }}>
      <Text strong>{copy.report}</Text>
      <Text>{copy.reportHint}</Text>
      <CreationField
        accessibilityLabel={copy.reportReason}
        testID="marketplace-avatar-report-reason"
        value={reason}
        onChangeText={setReason}
        editable={!action.busy}
        multiline
        maxLength={500}
      />
      {action.error ? (
        <Text tone="danger" accessibilityRole="alert">
          {action.error}
        </Text>
      ) : null}
      <Button
        tone="primary"
        label={copy.reportSend}
        testID="marketplace-avatar-report-send"
        busy={action.busy}
        onPress={() =>
          void action.run(
            async () => {
              const controller = new AbortController();
              report.current = controller;
              await actions.report(id, reason.trim(), controller.signal);
              if (!controller.signal.aborted) onReported();
            },
            () => t.dialogFailed,
          )
        }
      />
      <Button label={t.cancel} disabled={action.busy} onPress={onClose} />
    </View>
  );
}
