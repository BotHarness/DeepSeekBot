import * as Clipboard from 'expo-clipboard';
import { invitationLink } from '../../cloud/invitation-link';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, Share, View, type ScrollViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cloudError } from '../../cloud/client';
import type { Invitation } from '../../cloud/invitation-contract';
import { cloudClient, useCloudSnapshot } from '../../cloud/native';
import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { Button } from '../primitives/button';
import { KeyboardFormScroll } from '../primitives/keyboard-form';
import { Text } from '../primitives/text';
import { TextInput } from '../primitives/system-text';
import { t } from '../strings';
function InvitationScroll(props: ScrollViewProps) {
  const theme = useDesignTheme();
  return (
    <KeyboardFormScroll
      {...props}
      bottomOffset={
        Math.max(theme.touch, theme.type.body.line * theme.fontScale * 2) + space.x6 * 3
      }
    />
  );
}
function renderInvitationScroll(props: ScrollViewProps) {
  return <InvitationScroll {...props} />;
}
export function CloudInvitationsScreen() {
  const { instanceId, organizationId, channelId, channelName, kind } = useLocalSearchParams<{
    instanceId: string;
    organizationId?: string;
    channelId?: string;
    channelName?: string;
    kind?: string;
  }>();
  return (
    <>
      <Stack.Screen
        options={{
          title: kind === 'channel' || channelId ? t.cloudGuests.inbox : t.cloudInvitations.title,
        }}
      />
      <InvitationWorkspace
        key={instanceId + ':' + (organizationId ?? 'inbox') + ':' + (channelId ?? kind ?? '')}
        instanceId={instanceId}
        organizationId={organizationId}
        channelId={channelId}
        channelName={channelName?.slice(0, 80)}
        guest={kind === 'channel' || !!channelId}
      />
    </>
  );
}
function InvitationWorkspace({
  instanceId,
  organizationId,
  channelId,
  channelName,
  guest,
}: {
  instanceId: string;
  organizationId?: string | undefined;
  channelId?: string | undefined;
  channelName?: string | undefined;
  guest: boolean;
}) {
  const snapshot = useCloudSnapshot(),
    theme = useDesignTheme(),
    insets = useSafeAreaInsets();
  const row = snapshot.rows.find((r) => r.config.instanceId === instanceId);
  const allowed =
    !!row?.identity &&
    (!organizationId ||
      (row.organization?.organizationId === organizationId && row.organization.role === 'owner'));
  const [items, setItems] = useState<Invitation[]>();
  const [cursor, setCursor] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [working, setWorking] = useState(false),
    [error, setError] = useState<string>(),
    [notice, setNotice] = useState<string>();
  const busy = snapshot.busy || working;
  const pending = row?.pendingInvitation;
  const pendingHere =
    pending?.organizationId === organizationId && pending?.channelId === channelId
      ? pending
      : undefined;
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
    const page = await cloudClient.listInvitations(
      instanceId,
      organizationId,
      after,
      guest ? (channelId ?? true) : undefined,
    );
    setItems((old) =>
      after
        ? [
            ...(old ?? []),
            ...page.invitations.filter((i) => !old?.some((o) => o.invitationId === i.invitationId)),
          ]
        : page.invitations,
    );
    setCursor(page.nextCursor);
  };
  const box = {
    padding: space.x5,
    gap: space.x4,
    borderRadius: radius.lg,
    backgroundColor: theme.layer.raised.fill,
  };
  return (
    <FlatList
      style={{ flex: 1, backgroundColor: theme.color.base }}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      renderScrollComponent={renderInvitationScroll}
      contentContainerStyle={{
        padding: space.x5,
        paddingBottom: insets.bottom + space.x6,
        gap: space.x5,
      }}
      data={allowed ? (items ?? []) : []}
      keyExtractor={(item) => item.invitationId}
      ListHeaderComponent={
        <View style={{ gap: space.x4 }}>
          <Text variant="title">
            {organizationId
              ? row?.organization?.name
              : guest
                ? t.cloudGuests.inbox
                : t.cloudInvitations.inbox}
          </Text>
          {!!channelName && <Text variant="title">{channelName}</Text>}
          {!!error && (
            <Text accessibilityLiveRegion="polite">
              {t.cloud.error} {error}
            </Text>
          )}
          {!!notice && <Text accessibilityLiveRegion="polite">{notice}</Text>}
          {!allowed ? (
            <Text>{t.cloudInvitations.required}</Text>
          ) : (
            <>
              {!!organizationId && (
                <View style={box}>
                  <Text>{guest ? t.cloudGuests.hint : t.cloudInvitations.hint}</Text>
                  <TextInput
                    accessibilityLabel={t.cloudInvitations.email}
                    placeholder={t.cloudInvitations.email}
                    placeholderTextColor={theme.color.subtle}
                    style={{ color: theme.color.fg }}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    value={pendingHere?.email ?? email}
                    onChangeText={setEmail}
                    editable={!busy && !pendingHere}
                    maxLength={254}
                  />
                  {!!pendingHere && <Text>{t.cloudInvitations.pending}</Text>}
                  {!!pending && !pendingHere && <Text>{t.cloudChannels.pendingElsewhere}</Text>}
                  <Button
                    label={pendingHere ? t.cloudInvitations.retry : t.cloudInvitations.send}
                    disabled={
                      busy || (!!pending && !pendingHere) || !(pendingHere?.email ?? email).trim()
                    }
                    onPress={() =>
                      void run(async () => {
                        await cloudClient.sendInvitation(
                          instanceId,
                          organizationId,
                          pendingHere?.email ?? email,
                          channelId,
                        );
                        setEmail('');
                        setNotice(t.cloudInvitations.sent);
                        await reload();
                      })
                    }
                  />
                </View>
              )}
              <Button
                label={t.cloudInvitations.reload}
                disabled={busy}
                onPress={() => void run(() => reload())}
              />
            </>
          )}
          {busy && <Text accessibilityRole="progressbar">{t.cloud.working}</Text>}
        </View>
      }
      ListEmptyComponent={
        items && allowed && !busy ? <Text>{t.cloudInvitations.empty}</Text> : undefined
      }
      renderItem={({ item }) => (
        <View style={box}>
          {!!item.channelName && <Text variant="title">{item.channelName}</Text>}
          {!!item.organizationName && <Text variant="title">{item.organizationName}</Text>}
          <Text selectable>{item.email}</Text>
          <Text>
            {guest ? t.cloudGuests.role : t.cloudOrganizations.member} ·{' '}
            {t.cloudInvitations.states[item.state]}
          </Text>
          <Text>
            {t.cloudInvitations.expires} {item.expiresAt}
          </Text>
          {!!organizationId && item.state === 'pending' && !!row && (
            <>
              <Button
                label={t.cloudJoin.copy}
                disabled={busy}
                onPress={() =>
                  void run(async () => {
                    await Clipboard.setStringAsync(
                      invitationLink(row.config.server, item.invitationId),
                    );
                    setNotice(t.cloudJoin.copied);
                  })
                }
              />
              <Button
                label={t.cloudJoin.share}
                disabled={busy}
                onPress={() =>
                  void run(async () => {
                    await Share.share({
                      message: invitationLink(row.config.server, item.invitationId),
                    });
                  })
                }
              />
            </>
          )}
          {organizationId
            ? (item.state === 'pending' || (guest && item.state === 'accepted')) && (
                <Button
                  label={
                    guest && item.state === 'accepted'
                      ? t.cloudGuests.revoke
                      : t.cloudInvitations.revoke
                  }
                  disabled={busy}
                  onPress={() =>
                    void run(async () => {
                      await cloudClient.revokeInvitation(
                        instanceId,
                        organizationId,
                        item.invitationId,
                        channelId,
                      );
                      await reload();
                    })
                  }
                />
              )
            : (item.state === 'pending' || item.state === 'accepted') && (
                <Button
                  label={
                    item.state === 'accepted'
                      ? guest
                        ? t.cloudGuests.title
                        : t.cloudOrganizations.select
                      : t.cloudInvitations.accept
                  }
                  disabled={busy}
                  onPress={() =>
                    void run(async () => {
                      const accepted = await cloudClient.acceptInvitation(
                        instanceId,
                        item.invitationId,
                        guest,
                      );
                      if (!guest)
                        await cloudClient.useOrganization(instanceId, accepted.organizationId);
                      router.push({
                        pathname: '/cloud-channels',
                        params: guest
                          ? { instanceId, guest: 'true' }
                          : { instanceId, organizationId: accepted.organizationId },
                      });
                    })
                  }
                />
              )}
        </View>
      )}
      ListFooterComponent={
        cursor && allowed ? (
          <Button
            label={t.cloudOrganizations.more}
            disabled={busy}
            onPress={() => void run(() => reload(cursor))}
          />
        ) : undefined
      }
    />
  );
}
