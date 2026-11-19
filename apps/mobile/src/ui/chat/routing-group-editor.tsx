import { Stack, useFocusEffect, usePreventRemove, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { FlatList, Keyboard, View } from 'react-native';

import {
  errorText,
  sameModel,
  type ModelSettingsClient,
} from '@botharness/host-client/bot-settings';
import { MethodRefused } from '@botharness/host-client/client';
import type {
  ModelCatalogAnswer,
  RoutingGroup,
  RoutingGroupMember,
} from '@botharness/host-client/model-catalog';
import { loadModelCatalog } from '@botharness/host-client/model-plans';
import {
  createModelGroup,
  deleteModelGroup,
  loadModelGroup,
  modelGroupReferences,
  modelSettingsResource,
  updateModelGroup,
} from '@botharness/host-client/model-settings';

import { space } from '../design/tokens';
import { confirmDestructive } from '../primitives/app-dialog';
import { renderKeyboardFormScroll } from '../primitives/keyboard-form';
import { SettingsGroupItem, SettingsHeading, SettingsRow } from '../primitives/settings-row';
import { SheetPage } from '../primitives/sheet-page';
import { SheetSaveButton } from '../primitives/sheet-save-button';
import { TextField } from '../primitives/text-field';
import { useStrings } from '../strings';
import { RoutingGroupMemberPicker, routingGroupMemberKey } from './routing-group-member-picker';
import { RoutingGroupMemberRow } from './routing-group-member-row';
import { SHEET_GROUP, SheetCallout, SheetFailed, SheetLoading } from './sheet';

function refusalMessage(error: unknown, t: ReturnType<typeof useStrings>): string {
  if (!(error instanceof MethodRefused)) return errorText(error);
  const copy = t.routingGroup;
  switch (error.code) {
    case 'routing-group-cycle':
      return copy.cycle;
    case 'routing-group-empty-group':
      return copy.empty;
    case 'routing-group-in-use': {
      const references = modelGroupReferences(error.details);
      return references.length === 0 ? error.message : copy.inUse(references.join(', '));
    }
    case 'routing-group-stale-revision':
      return copy.stale;
    case 'routing-group-name-conflict':
      return copy.nameConflict;
    case 'routing-group-not-found':
      return copy.missing;
    default:
      return errorText(error);
  }
}

type EditorData = { catalog: ModelCatalogAnswer; group: RoutingGroup | undefined };

export function RoutingGroupEditorRoute({
  client,
  id,
}: {
  client: ModelSettingsClient;
  id: string | undefined;
}) {
  const t = useStrings();
  const [data, setData] = useState<EditorData | undefined>(() => {
    if (id !== undefined) return undefined;
    const catalog = modelSettingsResource(client, { kind: 'global' }).peek();
    return catalog === undefined ? undefined : { catalog, group: undefined };
  });
  const [failure, setFailure] = useState<{ cause: unknown }>();
  const error = failure === undefined ? undefined : refusalMessage(failure.cause, t);
  const [attempt, setAttempt] = useState(0);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void Promise.all([
        loadModelCatalog(client),
        id === undefined ? undefined : loadModelGroup(client, id),
      ]).then(
        ([catalog, group]) => {
          if (!active) return;
          setFailure(undefined);
          setData((current) => ({ catalog, group: current?.group ?? group }));
        },
        (cause: unknown) => {
          if (active) setFailure({ cause });
        },
      );
      return () => {
        active = false;
      };
    }, [attempt, client, id]),
  );
  if (data !== undefined)
    return <RoutingGroupEditor client={client} data={data} loadError={error} />;
  return (
    <SheetPage title={id === undefined ? t.routingGroup.add : t.routingGroup.edit}>
      {error === undefined ? (
        <SheetLoading />
      ) : (
        <SheetFailed
          message={error}
          onRetry={() => {
            setFailure(undefined);
            setAttempt(attempt + 1);
          }}
        />
      )}
    </SheetPage>
  );
}

function RoutingGroupEditor({
  client,
  data: { catalog, group },
  loadError,
}: {
  client: ModelSettingsClient;
  data: EditorData;
  loadError: string | undefined;
}) {
  const t = useStrings();
  const copy = t.routingGroup;
  const router = useRouter();
  const [name, setName] = useState(group?.name ?? '');
  const [members, setMembers] = useState(group?.members ?? []);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const list = useRef<FlatList<RoutingGroupMember>>(null);
  const pending = useRef(false);
  const finished = useRef(false);
  const trimmed = name.trim();
  const dirty =
    trimmed !== (group?.name ?? '') ||
    members.length !== (group?.members.length ?? 0) ||
    members.some((member, index) => {
      const initial = group?.members[index];
      return (
        initial === undefined || routingGroupMemberKey(initial) !== routingGroupMemberKey(member)
      );
    });
  usePreventRemove(busy || dirty, ({ repeat }) => {
    if (finished.current) repeat();
    else if (!pending.current)
      confirmDestructive(copy.discardTitle, undefined, copy.discard, repeat);
  });
  const run = async (operation: () => Promise<void>) => {
    if (pending.current || finished.current) return;
    pending.current = true;
    setBusy(true);
    setError(undefined);
    Keyboard.dismiss();
    try {
      await operation();
      finished.current = true;
      router.back();
    } catch (cause) {
      setError(refusalMessage(cause, t));
      list.current?.scrollToOffset({ offset: 0, animated: false });
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const save = () => {
    if (trimmed === '' || !dirty || members.length === 0) return;
    const input = { name: trimmed, members };
    void run(() =>
      group === undefined
        ? createModelGroup(client, input)
        : updateModelGroup(client, group.id, group.revision, input),
    );
  };
  const move = (member: RoutingGroupMember, by: number) => {
    setError(undefined);
    setMembers((current) => {
      const index = current.indexOf(member);
      const displaced = current[index + by];
      if (index < 0 || displaced === undefined) return current;
      const next = [...current];
      next[index] = displaced;
      next[index + by] = member;
      return next;
    });
  };
  const message = error ?? loadError;
  return (
    <SheetPage>
      <Stack.Screen
        options={{
          title: group === undefined ? copy.add : copy.edit,
          headerRight: () => (
            <SheetSaveButton
              label={copy.save}
              testID="routing-group-save"
              disabled={!dirty || trimmed === '' || members.length === 0}
              busy={busy}
              onPress={save}
            />
          ),
        }}
      />
      <FlatList
        ref={list}
        style={{ flex: 1 }}
        data={members}
        keyExtractor={routingGroupMemberKey}
        renderScrollComponent={renderKeyboardFormScroll}
        contentContainerStyle={{ paddingBottom: space.x4 }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <>
            {message === undefined ? null : <SheetCallout tone="danger">{message}</SheetCallout>}
            <View style={{ gap: space.x3, paddingTop: space.x4, paddingBottom: space.x3 }}>
              <SettingsHeading>{copy.name}</SettingsHeading>
              <View style={{ paddingHorizontal: space.x5 }}>
                <TextField
                  testID="routing-group-name"
                  accessibilityLabel={copy.name}
                  value={name}
                  editable={!busy}
                  maxLength={100}
                  onChangeText={(next) => {
                    setError(undefined);
                    setName(next);
                  }}
                />
              </View>
              <SettingsHeading>{copy.members}</SettingsHeading>
            </View>
          </>
        }
        renderItem={({ item, index }) => {
          const entry =
            item.kind === 'model'
              ? catalog.models.find((model) => sameModel(model, item))
              : undefined;
          const name =
            item.kind === 'group'
              ? (catalog.groups?.find((group) => group.id === item.id)?.name ?? item.id)
              : (entry?.modelName ?? item.model);
          const detail =
            item.kind === 'group'
              ? copy.group
              : [entry?.providerName ?? item.provider, item.reasoningEffort]
                  .filter(Boolean)
                  .join(' · ');
          return (
            <SettingsGroupItem first={index === 0} last={false} on={SHEET_GROUP}>
              <RoutingGroupMemberRow
                index={index}
                name={name}
                detail={detail}
                moveUp={busy || index === 0 ? undefined : () => move(item, -1)}
                moveDown={busy || index === members.length - 1 ? undefined : () => move(item, 1)}
                remove={
                  busy
                    ? undefined
                    : () => {
                        setError(undefined);
                        setMembers((current) => current.filter((member) => member !== item));
                      }
                }
              />
            </SettingsGroupItem>
          );
        }}
        ListFooterComponent={
          <>
            <SettingsGroupItem first={members.length === 0} last on={SHEET_GROUP}>
              <SettingsRow
                testID="routing-group-add-member"
                on={SHEET_GROUP}
                title={copy.addMember}
                control={{ kind: 'add' }}
                onPress={
                  busy
                    ? undefined
                    : () => {
                        Keyboard.dismiss();
                        setPicking(true);
                      }
                }
              />
            </SettingsGroupItem>
            {group === undefined ? null : (
              <View style={{ paddingTop: space.x4 }}>
                <SettingsGroupItem first last on={SHEET_GROUP}>
                  <SettingsRow
                    testID="routing-group-delete"
                    on={SHEET_GROUP}
                    title={copy.delete}
                    tone="danger"
                    onPress={
                      busy
                        ? undefined
                        : () =>
                            confirmDestructive(
                              copy.deleteTitle(group.name),
                              copy.deleteDetail,
                              copy.delete,
                              () => run(() => deleteModelGroup(client, group.id, group.revision)),
                            )
                    }
                  />
                </SettingsGroupItem>
              </View>
            )}
          </>
        }
      />
      {picking ? (
        <RoutingGroupMemberPicker
          catalog={catalog}
          selfId={group?.id}
          members={members}
          onSelect={(member) => {
            setMembers((current) =>
              current.some(
                (entry) => routingGroupMemberKey(entry) === routingGroupMemberKey(member),
              )
                ? current
                : [...current, member],
            );
            setError(undefined);
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      ) : null}
    </SheetPage>
  );
}
