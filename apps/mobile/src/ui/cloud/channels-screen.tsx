import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { FlatList, View, type ScrollViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cloudError } from '../../cloud/client';
import type { CloudChannel, CloudMessage } from '../../cloud/channel-contract';
import { cloudClient, useCloudSnapshot } from '../../cloud/native';
import { cloudViewScope } from '../../cloud/workspace-directory';
import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { Button } from '../primitives/button';
import { KeyboardFormScroll } from '../primitives/keyboard-form';
import { Text } from '../primitives/text';
import { TextInput } from '../primitives/system-text';
import { t } from '../strings';
import { CloudChannelName } from './channel-name';

function ChannelFormScroll({
  actionLines = 2,
  ...props
}: ScrollViewProps & { actionLines?: number }) {
  const theme = useDesignTheme();
  return (
    <KeyboardFormScroll
      {...props}
      bottomOffset={
        Math.max(theme.touch, theme.type.body.line * theme.fontScale * actionLines) + space.x6 * 3
      }
    />
  );
}
function renderChannelFormScroll(props: ScrollViewProps) {
  return <ChannelFormScroll {...props} />;
}

function renderGuestChannelFormScroll(props: ScrollViewProps) {
  return <ChannelFormScroll {...props} actionLines={1} />;
}

export function CloudChannelsScreen() {
  const snapshot = useCloudSnapshot();
  const { instanceId, organizationId, guest, channelId } = useLocalSearchParams<{
    instanceId: string;
    organizationId?: string;
    guest?: string;
    channelId?: string;
  }>();
  return (
    <ChannelWorkspace
      key={JSON.stringify([
        instanceId,
        organizationId,
        guest,
        channelId,
        cloudViewScope(snapshot.rows.find((row) => row.config.instanceId === instanceId)),
      ])}
      instanceId={instanceId}
      organizationId={organizationId ?? ''}
      guest={guest === 'true'}
      initialChannelId={channelId}
    />
  );
}
function ChannelWorkspace({
  instanceId,
  organizationId,
  guest,
  initialChannelId,
}: {
  instanceId: string;
  organizationId: string;
  guest: boolean;
  initialChannelId?: string | undefined;
}) {
  const snapshot = useCloudSnapshot(),
    theme = useDesignTheme(),
    insets = useSafeAreaInsets();
  const row = snapshot.rows.find((r) => r.config.instanceId === instanceId);
  const allowed = !!row?.identity && (guest || row.organization?.organizationId === organizationId);
  const [channels, setChannels] = useState<CloudChannel[]>();
  const [channelCursor, setChannelCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<CloudChannel>();
  const [messages, setMessages] = useState<CloudMessage[]>();
  const [cursor, setCursor] = useState(0),
    [more, setMore] = useState(false);
  const [name, setName] = useState(''),
    [draft, setDraft] = useState('');
  const [working, setWorking] = useState(false),
    [error, setError] = useState<string>(),
    [notice, setNotice] = useState<string>();
  const busy = working || snapshot.busy;
  const opened = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!snapshot.ready || snapshot.busy || opened.current) return;
      opened.current = true;
      void run(async () => {
        if (!initialChannelId) {
          if (!row?.identity) await cloudClient.whoami(instanceId);
          await reload();
          return;
        }
        const channel = await cloudClient.openChannel(
          instanceId,
          organizationId,
          initialChannelId,
          guest,
        );
        await history(channel);
        setSelected(channel);
      });
    }, [initialChannelId, instanceId, organizationId, guest, snapshot.ready, snapshot.busy]),
  );
  const pending = row?.pendingChannelAction;
  const pendingHere = (
    guest
      ? pending?.kind === 'guest.send'
      : pending?.kind !== 'guest.send' && pending?.organizationId === organizationId
  )
    ? pending
    : undefined;
  const pendingCreate = pendingHere?.kind === 'channel.create' ? pendingHere : undefined;
  const pendingSend =
    pendingHere?.kind === (guest ? 'guest.send' : 'message.send') &&
    pendingHere.channelId === selected?.channelId
      ? pendingHere
      : undefined;
  const box = {
    padding: space.x5,
    gap: space.x4,
    borderRadius: radius.lg,
    backgroundColor: theme.layer.raised.fill,
  };
  const run = async (action: () => Promise<void>) => {
    if (working) return;
    setWorking(true);
    setError(undefined);
    setNotice(undefined);
    try {
      await action();
    } catch (e) {
      setError(cloudError(e));
    } finally {
      setWorking(false);
    }
  };
  const reload = async (after?: string) => {
    const page = await cloudClient.listChannels(instanceId, organizationId, after, guest);
    setChannels((old) =>
      after
        ? [
            ...(old ?? []),
            ...page.channels.filter((c) => !old?.some((o) => o.channelId === c.channelId)),
          ]
        : page.channels,
    );
    setChannelCursor(page.nextCursor);
  };
  const history = async (channel: CloudChannel, after = 0) => {
    const page = await cloudClient.readMessages(
      instanceId,
      organizationId,
      channel.channelId,
      after,
      guest,
    );
    setMessages((old) =>
      after
        ? [
            ...(old ?? []),
            ...page.messages.filter((m) => !old?.some((o) => o.sequence === m.sequence)),
          ]
        : page.messages,
    );
    setCursor(page.nextCursor);
    setMore(page.hasMore);
  };
  return (
    <FlatList<CloudChannel | CloudMessage>
      style={{ flex: 1, backgroundColor: theme.color.base }}
      contentInsetAdjustmentBehavior="automatic"
      renderScrollComponent={guest ? renderGuestChannelFormScroll : renderChannelFormScroll}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        padding: space.x5,
        paddingBottom: insets.bottom + space.x6,
        gap: space.x5,
      }}
      data={allowed ? (selected ? (messages ?? []) : (channels ?? [])) : []}
      keyExtractor={(item) => ('sequence' in item ? 'message-' + item.sequence : item.channelId)}
      ListHeaderComponent={
        <View style={{ gap: space.x4 }}>
          <Text variant="title">
            {guest
              ? (organizationId && channels?.[0]?.organizationName) || t.cloudGuests.title
              : row?.organization?.name}
          </Text>
          {!!error && (
            <Text accessibilityLiveRegion="polite">
              {t.cloud.error} {error}
            </Text>
          )}
          {!!notice && <Text accessibilityLiveRegion="polite">{notice}</Text>}
          {!!initialChannelId && !selected && (
            <Button
              label={t.cloudChannels.open}
              disabled={busy}
              onPress={() =>
                void run(async () => {
                  const channel = await cloudClient.openChannel(
                    instanceId,
                    organizationId,
                    initialChannelId,
                    guest,
                  );
                  await history(channel);
                  setSelected(channel);
                })
              }
            />
          )}
          {!allowed ? (
            <Text>{t.cloudChannels.selectWorkspace}</Text>
          ) : selected ? (
            <>
              <CloudChannelName name={selected.name} />
              {guest && <Text>{t.cloudGuests.hint}</Text>}
              {!guest && (
                <Button
                  label={t.cloudAgents.title}
                  disabled={busy}
                  onPress={() =>
                    router.push({
                      pathname: '/cloud-agents',
                      params: {
                        instanceId,
                        organizationId,
                        channelId: selected.channelId,
                        channelName: selected.name,
                      },
                    })
                  }
                />
              )}
              {!guest && row.organization?.role === 'owner' && (
                <Button
                  label={t.cloudGuests.manage}
                  disabled={busy}
                  onPress={() =>
                    router.push({
                      pathname: '/cloud-invitations',
                      params: {
                        instanceId,
                        organizationId,
                        channelId: selected.channelId,
                        channelName: selected.name,
                      },
                    })
                  }
                />
              )}
              <Button
                label={t.cloudChannels.back}
                disabled={busy}
                onPress={() => {
                  setSelected(undefined);
                  setMessages(undefined);
                  setDraft('');
                  setNotice(undefined);
                }}
              />
              <Button
                label={t.cloudChannels.reloadMessages}
                disabled={busy}
                onPress={() => void run(() => history(selected))}
              />
              <View style={box}>
                <TextInput
                  accessibilityLabel={t.cloudChannels.message}
                  placeholder={t.cloudChannels.message}
                  placeholderTextColor={theme.color.subtle}
                  style={{ color: theme.color.fg }}
                  multiline
                  maxLength={4000}
                  value={pendingSend?.value ?? draft}
                  editable={!busy && !pendingSend}
                  onChangeText={setDraft}
                />
                {!!pendingSend && <Text>{t.cloudChannels.pending}</Text>}
                <Button
                  label={pendingSend ? t.cloudChannels.retrySend : t.cloudChannels.send}
                  disabled={busy || !(pendingSend?.value ?? draft).trim()}
                  onPress={() =>
                    void run(async () => {
                      const result = await cloudClient.sendMessage(
                        instanceId,
                        guest ? selected.organizationId! : organizationId,
                        selected.channelId,
                        pendingSend?.value ?? draft,
                        guest,
                      );
                      setDraft('');
                      setNotice(t.cloudChannels.committed + ' ' + result.sequence);
                      await history(selected);
                    })
                  }
                />
              </View>
            </>
          ) : (
            <>
              {!guest && row.organization?.role === 'owner' && (
                <View style={box}>
                  <TextInput
                    accessibilityLabel={t.cloudChannels.name}
                    placeholder={t.cloudChannels.name}
                    placeholderTextColor={theme.color.subtle}
                    style={{ color: theme.color.fg }}
                    value={pendingCreate?.value ?? name}
                    maxLength={80}
                    editable={!busy && !pendingCreate}
                    onChangeText={setName}
                  />
                  {!!pendingCreate && <Text>{t.cloudChannels.pending}</Text>}
                  <Button
                    label={pendingCreate ? t.cloudChannels.retryCreate : t.cloudChannels.create}
                    disabled={busy || !(pendingCreate?.value ?? name).trim()}
                    onPress={() =>
                      void run(async () => {
                        await cloudClient.createChannel(
                          instanceId,
                          organizationId,
                          pendingCreate?.value ?? name,
                        );
                        setName('');
                        await reload();
                      })
                    }
                  />
                </View>
              )}
              <Button
                label={t.cloudChannels.reload}
                disabled={busy}
                onPress={() => void run(() => reload())}
              />
            </>
          )}
          {!!pending && !pendingHere && <Text>{t.cloudChannels.pendingElsewhere}</Text>}
          {busy && <Text accessibilityRole="progressbar">{t.cloud.working}</Text>}
        </View>
      }
      renderItem={({ item }) =>
        'sequence' in item ? (
          <View style={box}>
            <Text>
              {item.authorType} · {item.authorId}
            </Text>
            <Text selectable>{item.text}</Text>
            <Text>
              {t.cloudChannels.committed} {item.sequence}
            </Text>
          </View>
        ) : (
          <View style={box}>
            <CloudChannelName name={item.name} />
            <Button
              label={t.cloudChannels.open + ': ' + item.name}
              disabled={busy}
              onPress={() =>
                void run(async () => {
                  setSelected(item);
                  setMessages(undefined);
                  setDraft('');
                  await history(item);
                })
              }
            />
          </View>
        )
      }
      ListEmptyComponent={
        allowed && !busy && (selected ? messages : channels) ? (
          <Text>
            {selected
              ? t.cloudChannels.noMessages
              : guest
                ? t.cloudGuests.empty
                : t.cloudChannels.empty}
          </Text>
        ) : undefined
      }
      ListFooterComponent={
        allowed && (selected ? more : channelCursor) ? (
          <Button
            label={t.cloudOrganizations.more}
            disabled={busy}
            onPress={() =>
              void run(() => (selected ? history(selected, cursor) : reload(channelCursor!)))
            }
          />
        ) : undefined
      }
    />
  );
}
