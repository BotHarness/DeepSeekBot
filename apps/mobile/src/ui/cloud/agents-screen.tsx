import { useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { FlatList, View, type ScrollViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cloudError } from '../../cloud/client';
import type { CloudAgent } from '../../cloud/agent-contract';
import { cloudClient, useCloudSnapshot } from '../../cloud/native';
import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { Button } from '../primitives/button';
import { KeyboardFormScroll } from '../primitives/keyboard-form';
import { Text } from '../primitives/text';
import { TextField } from '../primitives/text-field';
import { t } from '../strings';
import { confirmDestructive } from '../primitives/app-dialog';
function AgentScroll(props: ScrollViewProps) {
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
function renderAgentScroll(props: ScrollViewProps) {
  return <AgentScroll {...props} />;
}
export function CloudAgentsScreen() {
  const params = useLocalSearchParams<{
    instanceId: string;
    organizationId: string;
    channelId: string;
    channelName?: string;
  }>();
  return (
    <Agents
      key={params.instanceId + ':' + params.organizationId + ':' + params.channelId}
      {...params}
    />
  );
}
function Agents({
  instanceId,
  organizationId,
  channelId,
  channelName,
}: {
  instanceId: string;
  organizationId: string;
  channelId: string;
  channelName?: string;
}) {
  const snapshot = useCloudSnapshot(),
    theme = useDesignTheme(),
    insets = useSafeAreaInsets();
  const row = snapshot.rows.find((r) => r.config.instanceId === instanceId);
  const allowed = !!row?.identity && row.organization?.organizationId === organizationId;
  const owner = allowed && row.organization?.role === 'owner';
  const [items, setItems] = useState<CloudAgent[]>(),
    [cursor, setCursor] = useState<string | null>(null);
  const [name, setName] = useState(''),
    [working, setWorking] = useState(false),
    [error, setError] = useState<string>(),
    [notice, setNotice] = useState<string>();
  const busy = snapshot.busy || working;
  const handoff = row?.agentHandoff;
  const here =
    handoff?.organizationId === organizationId &&
    handoff?.channelId === channelId &&
    handoff.ownerUserId === row?.identity?.userId
      ? handoff
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
    const page = await cloudClient.listAgents(instanceId, organizationId, channelId, after);
    setItems((old) =>
      after
        ? [...(old ?? []), ...page.agents.filter((a) => !old?.some((o) => o.actorId === a.actorId))]
        : page.agents,
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
      renderScrollComponent={renderAgentScroll}
      contentContainerStyle={{
        padding: space.x5,
        paddingBottom: insets.bottom + space.x6,
        gap: space.x5,
      }}
      data={allowed ? (items ?? []) : []}
      keyExtractor={(a) => a.actorId}
      ListHeaderComponent={
        <View style={{ gap: space.x4 }}>
          <Text variant="title">{channelName?.slice(0, 80) ?? t.cloudAgents.title}</Text>
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
              <Text>{t.cloudAgents.workHint}</Text>
              {!!row?.pendingWork && (
                <View style={box}>
                  <Text>{t.cloudAgents.workPending}</Text>
                  <Button
                    label={t.cloudAgents.clearWork}
                    disabled={busy}
                    onPress={() =>
                      void run(async () => {
                        await cloudClient.clearPendingWork(instanceId);
                      })
                    }
                  />
                </View>
              )}
              {owner && (
                <View style={box}>
                  <Text>{t.cloudAgents.hint}</Text>
                  <TextField
                    accessibilityLabel={t.cloudAgents.name}
                    placeholder={t.cloudAgents.name}
                    value={here?.name ?? name}
                    onChangeText={setName}
                    editable={!busy && !handoff}
                    maxLength={80}
                    autoCorrect={false}
                  />
                  {!here?.ready && (
                    <Button
                      label={here ? t.cloudAgents.retry : t.cloudAgents.create}
                      disabled={busy || (!!handoff && !here) || !(here?.name ?? name).trim()}
                      onPress={() =>
                        void run(async () => {
                          await cloudClient.createAgent(
                            instanceId,
                            organizationId,
                            channelId,
                            here?.name ?? name,
                          );
                          setName('');
                          setNotice(t.cloudAgents.created);
                          await reload();
                        })
                      }
                    />
                  )}
                  {!!handoff && !here && <Text>{t.cloudAgents.elsewhere}</Text>}
                  {!!here && (
                    <>
                      <Text>{t.cloudAgents.handoff}</Text>
                      {here.ready && (
                        <Button
                          label={t.cloudAgents.copy}
                          disabled={busy}
                          onPress={() =>
                            void run(async () => {
                              const credential = await cloudClient.exportAgentCredential(
                                instanceId,
                                organizationId,
                                channelId,
                                here.name,
                              );
                              await Clipboard.setStringAsync(credential);
                              setNotice(t.cloudAgents.copied);
                            })
                          }
                        />
                      )}
                      <Button
                        label={t.cloudAgents.clear}
                        disabled={busy}
                        onPress={() =>
                          void run(async () => {
                            await cloudClient.clearAgentHandoff(instanceId);
                          })
                        }
                      />
                    </>
                  )}
                </View>
              )}
              <Button
                label={t.cloudAgents.reload}
                disabled={busy}
                onPress={() => void run(() => reload())}
              />
            </>
          )}
          {busy && <Text accessibilityRole="progressbar">{t.cloud.working}</Text>}
        </View>
      }
      ListEmptyComponent={
        items && allowed && !busy ? <Text>{t.cloudAgents.empty}</Text> : undefined
      }
      renderItem={({ item }) => (
        <View style={box}>
          <Text variant="title">{item.name}</Text>
          <Text selectable>{item.actorId}</Text>
          <Text>{t.cloudAgents.states[item.state]}</Text>
          <Text>
            {t.cloudInvitations.expires} {item.expiresAt}
          </Text>
          {item.state === 'active' && (
            <Button
              label={
                row?.pendingWork?.targetActorId === item.actorId
                  ? t.cloudAgents.retryWork
                  : t.cloudAgents.request
              }
              disabled={
                busy ||
                (!!row?.pendingWork &&
                  (row.pendingWork.targetActorId !== item.actorId ||
                    row.pendingWork.channelId !== channelId))
              }
              onPress={() =>
                void run(async () => {
                  await cloudClient.requestHealthCheck(
                    instanceId,
                    organizationId,
                    channelId,
                    item.actorId,
                  );
                  setNotice(t.cloudAgents.workSent);
                })
              }
            />
          )}
          {owner && item.state === 'active' && (
            <Button
              label={t.cloudAgents.revoke}
              tone="danger"
              disabled={busy}
              onPress={() =>
                confirmDestructive(
                  t.confirmAction(t.cloudAgents.revoke),
                  t.cloudAgents.revokeDetail,
                  t.cloudAgents.revoke,
                  () =>
                    void run(async () => {
                      await cloudClient.revokeAgent(
                        instanceId,
                        organizationId,
                        channelId,
                        item.actorId,
                      );
                      await reload();
                    }),
                )
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
