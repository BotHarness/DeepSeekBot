import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cloudError, type CloudSnapshot, type Organization } from '../../cloud/client';
import { cloudClient, useCloudSnapshot } from '../../cloud/native';
import { cloudViewScope } from '../../cloud/workspace-directory';
import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { Button } from '../primitives/button';
import { Text } from '../primitives/text';
import { TextField } from '../primitives/text-field';
import { t } from '../strings';

export function CloudOrganizationsScreen() {
  const { instanceId } = useLocalSearchParams<{ instanceId: string }>();
  const snapshot = useCloudSnapshot();
  const row = snapshot.rows.find((r) => r.config.instanceId === instanceId);
  return (
    <OrganizationWorkspace key={cloudViewScope(row)} instanceId={instanceId} snapshot={snapshot} />
  );
}

function OrganizationWorkspace({
  instanceId,
  snapshot,
}: {
  instanceId: string;
  snapshot: CloudSnapshot;
}) {
  const row = snapshot.rows.find((r) => r.config.instanceId === instanceId);
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Organization[]>();
  const [cursor, setCursor] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [draft, setDraft] = useState<{ key: string; text: string }>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [working, setWorking] = useState(false);
  const busy = snapshot.busy || working;
  const selected = row?.organization;
  const selectionKey = selected
    ? selected.organizationId + ':' + selected.version + ':' + selected.role
    : '';
  const description =
    selected?.role === 'owner' && draft?.key === selectionKey
      ? draft.text
      : (selected?.description ?? '');
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
    const page = await cloudClient.listOrganizations(instanceId, after);
    setItems((old) =>
      after
        ? [
            ...(old ?? []),
            ...page.organizations.filter(
              (next) => !old?.some((item) => item.organizationId === next.organizationId),
            ),
          ]
        : page.organizations,
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
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        padding: space.x5,
        paddingBottom: insets.bottom + space.x6,
        gap: space.x5,
      }}
      data={row?.identity ? (items ?? []) : []}
      keyExtractor={(item) => item.organizationId}
      ListHeaderComponent={
        <View style={{ gap: space.x4 }}>
          <Text>{row?.config.name}</Text>
          {!!error && (
            <Text accessibilityLiveRegion="polite">
              {t.cloud.error} {error}
            </Text>
          )}
          {!!notice && <Text accessibilityLiveRegion="polite">{notice}</Text>}
          {!row?.identity ? (
            <Text>{t.cloudOrganizations.verified}</Text>
          ) : (
            <>
              <View style={box}>
                <TextField
                  accessibilityLabel={t.cloudOrganizations.name}
                  placeholder={t.cloudOrganizations.name}
                  value={row.pendingCreate?.name ?? name}
                  onChangeText={setName}
                  editable={!busy && !row.pendingCreate}
                  maxLength={80}
                />
                {!!row.pendingCreate && <Text>{t.cloudOrganizations.pending}</Text>}
                <Button
                  label={
                    row.pendingCreate
                      ? t.cloudOrganizations.retryCreate
                      : t.cloudOrganizations.create
                  }
                  disabled={busy || !(row.pendingCreate?.name ?? name).trim()}
                  onPress={() =>
                    void run(async () => {
                      const id = await cloudClient.createOrganization(
                        instanceId,
                        row.pendingCreate?.name ?? name,
                      );
                      setName('');
                      await cloudClient.useOrganization(instanceId, id);
                      await reload();
                    })
                  }
                />
              </View>
              <Button
                label={t.cloudGuests.inbox}
                disabled={busy}
                onPress={() =>
                  router.push({
                    pathname: '/cloud-invitations',
                    params: { instanceId, kind: 'channel' },
                  })
                }
              />
              <Button
                label={t.cloudGuests.title}
                disabled={busy}
                onPress={() =>
                  router.push({
                    pathname: '/cloud-channels',
                    params: { instanceId, guest: 'true' },
                  })
                }
              />
              <Button
                label={t.cloudInvitations.inbox}
                disabled={busy}
                onPress={() =>
                  router.push({ pathname: '/cloud-invitations', params: { instanceId } })
                }
              />
              <Button
                label={t.cloudOrganizations.list}
                disabled={busy}
                onPress={() => void run(() => reload())}
              />
              {!!selected && (
                <View style={box}>
                  <Text variant="title">
                    {t.cloudOrganizations.selected}: {selected.name}
                  </Text>
                  <Text>
                    {selected.role === 'owner'
                      ? t.cloudOrganizations.owner
                      : t.cloudOrganizations.member}
                  </Text>
                  <Button
                    label={t.cloudChannels.title}
                    disabled={busy}
                    onPress={() =>
                      router.push({
                        pathname: '/cloud-channels',
                        params: { instanceId, organizationId: selected.organizationId },
                      })
                    }
                  />
                  {selected.role === 'owner' && (
                    <Button
                      label={t.cloudInvitations.title}
                      disabled={busy}
                      onPress={() =>
                        router.push({
                          pathname: '/cloud-invitations',
                          params: { instanceId, organizationId: selected.organizationId },
                        })
                      }
                    />
                  )}
                  <TextField
                    accessibilityLabel={t.cloudOrganizations.description}
                    placeholder={t.cloudOrganizations.description}
                    value={description}
                    onChangeText={(text) => setDraft({ key: selectionKey, text })}
                    editable={!busy && selected.role === 'owner'}
                    multiline
                    maxLength={500}
                  />
                  {selected.role === 'owner' ? (
                    <Button
                      label={t.cloudOrganizations.save}
                      disabled={busy || description === selected.description}
                      onPress={() =>
                        void run(async () => {
                          await cloudClient.updateOrganization(
                            instanceId,
                            description,
                            selected.version,
                          );
                          setNotice(t.cloudOrganizations.saved);
                          await reload();
                        })
                      }
                    />
                  ) : (
                    <Text>{t.cloudOrganizations.memberHint}</Text>
                  )}
                </View>
              )}
            </>
          )}
          {busy && <Text accessibilityRole="progressbar">{t.cloud.working}</Text>}
        </View>
      }
      ListEmptyComponent={
        items && row?.identity && !busy ? <Text>{t.cloudOrganizations.empty}</Text> : undefined
      }
      renderItem={({ item }) => (
        <View style={box}>
          <Text variant="title">{item.name}</Text>
          <Text>
            {item.role === 'owner' ? t.cloudOrganizations.owner : t.cloudOrganizations.member}
          </Text>
          <Button
            label={`${t.cloudOrganizations.select}: ${item.name}`}
            disabled={busy}
            onPress={() =>
              void run(async () => {
                await cloudClient.useOrganization(instanceId, item.organizationId);
                setDraft(undefined);
                await reload();
              })
            }
          />
        </View>
      )}
      ListFooterComponent={
        cursor && row?.identity ? (
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
