import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import type { HostClient } from '@botharness/host-client/client';
import {
  modelScopeKey,
  modelSub,
  setModelSub,
  subEffortOptions,
  type AssignmentEffortTarget,
  type ModelScope,
} from '@botharness/host-client/model-settings';
import {
  removeSubChoice,
  setSubDefault,
  setSubEffort,
  setSubNote,
  staleGroupEfforts,
  subSelectionOf,
} from '@botharness/host-client/preset-sub';
import { matchesPresetSubChoice } from '@botharness/host-protocol/preset-sub';

import { useHostSession } from '../../host/host-session';
import { space } from '../design/tokens';
import { LoadingIndicator } from '../primitives/loading-indicator';
import { SettingsRow, SettingsSection } from '../primitives/settings-row';
import { SheetPage } from '../primitives/sheet-page';
import { TextField } from '../primitives/text-field';
import { useStrings } from '../strings';
import { useModels } from './model-settings-screen';
import { SHEET_GROUP, SheetFailed, SheetLoading, SheetNote } from './sheet';
import { useEngineOptions } from './sub-choice-engines';
import { subChoiceKey, subChoiceTarget, subChoiceView } from './sub-choice-text';

export function subChoiceTargetParams(target: AssignmentEffortTarget): Record<string, string> {
  switch (target.kind) {
    case 'group':
      return { group: target.id };
    case 'model':
      return { provider: target.provider, model: target.model };
    case 'engine':
      return {
        engine: target.engine,
        ...(target.accountId === undefined ? {} : { account: target.accountId }),
        ...(target.model === undefined ? {} : { model: target.model }),
      };
  }
}

export function SubChoiceRoute({ kind }: { kind: 'preset' | 'bot' }) {
  const t = useStrings();
  const {
    id = '',
    slug = '',
    key = '',
  } = useLocalSearchParams<{
    id: string;
    slug: string;
    key: string;
  }>();
  const { client, saved } = useHostSession();
  if (client === undefined) return <SheetNote>{t.unreachable}</SheetNote>;
  const scope: ModelScope = kind === 'bot' ? { kind, slug } : { kind, id };
  return (
    <SubChoiceDetail
      key={`${saved?.hostId}:${modelScopeKey(scope)}:${key}`}
      client={client}
      scope={scope}
      choiceKey={key}
    />
  );
}

function SubChoiceDetail({
  client,
  scope,
  choiceKey,
}: {
  client: HostClient;
  scope: ModelScope;
  choiceKey: string;
}) {
  const t = useStrings();
  const router = useRouter();
  const models = useModels(client, scope);
  const engines = useEngineOptions(client);
  const value = models.value;
  const sub = value === undefined ? undefined : modelSub(value);
  const choice = sub?.choices.find((entry) => subChoiceKey(entry) === choiceKey);
  const [note, setNote] = useState<string>();
  const view =
    value === undefined || choice === undefined ? undefined : subChoiceView(value, choice, engines);
  const page = (body: React.ReactNode) => (
    <SheetPage title={view?.title ?? t.subChoices.title}>{body}</SheetPage>
  );
  if (value === undefined || sub === undefined)
    return page(
      models.error === undefined ? (
        <SheetLoading />
      ) : (
        <SheetFailed message={t.modelFailed} onRetry={models.refresh} />
      ),
    );
  if (choice === undefined || view === undefined)
    return page(<SheetNote>{t.subChoices.followsMainHint}</SheetNote>);
  const selection = subSelectionOf(choice);
  const target = subChoiceTarget(choice);
  const efforts = subEffortOptions(value, target, engines);
  const effortIds = efforts?.options.map((entry) => entry.id) ?? [];
  const stale = staleGroupEfforts(choice, effortIds);
  const hasEffort = efforts !== undefined && efforts.options.length > 0;
  const isDefault = sub.default !== null && matchesPresetSubChoice(choice, sub.default);
  const save = (next: typeof sub, done?: () => void) =>
    models.run(() => setModelSub(client, scope, value, next), done);
  const openEffort = () => {
    const params = { field: 'sub-effort', ...subChoiceTargetParams(target) };
    if (scope.kind === 'bot')
      router.push({
        pathname: '/bot/[slug]/model-picker',
        params: { slug: scope.slug, ...params },
      });
    else
      router.push({
        pathname: '/settings/model-picker',
        params: { ...params, ...(scope.kind === 'preset' ? { id: scope.id } : {}) },
      });
  };
  const shownNote = note ?? choice.note ?? '';
  const commitNote = () => {
    if (note === undefined || note === (choice.note ?? '')) return;
    save(setSubNote(sub, selection, note), () => setNote(undefined));
  };
  return page(
    <ScrollView
      style={{ flex: 1 }}
      keyboardDismissMode="on-drag"
      contentContainerStyle={{ paddingVertical: space.x3, gap: space.x4 }}
    >
      {models.error === undefined ? null : <SheetNote>{models.error}</SheetNote>}
      {models.busy ? <LoadingIndicator /> : null}
      <View style={{ paddingHorizontal: space.x5, gap: space.x4 }}>
        {hasEffort || stale ? (
          <SettingsSection on={SHEET_GROUP} {...(stale ? { footer: t.subChoices.stale } : {})}>
            {efforts === undefined || efforts.options.length === 0 ? null : (
              <SettingsRow
                on={SHEET_GROUP}
                testID="sub-choice-effort"
                title={t.subChoices.effort}
                detail={
                  efforts.effort === ''
                    ? t.modelSettings.providerDefault
                    : (efforts.options.find((entry) => entry.id === efforts.effort)?.name ??
                      efforts.effort)
                }
                disclosure
                onPress={models.busy ? undefined : openEffort}
              />
            )}
            {stale ? (
              <SettingsRow
                on={SHEET_GROUP}
                testID="sub-choice-clear-efforts"
                title={t.subChoices.clearEfforts}
                tone="accent"
                onPress={
                  models.busy ? undefined : () => save(setSubEffort(sub, selection, '', effortIds))
                }
              />
            ) : null}
          </SettingsSection>
        ) : null}
        <TextField
          value={shownNote}
          onChangeText={setNote}
          accessibilityLabel={t.subChoices.noteLabel(view.title)}
          placeholder={t.subChoices.note}
          maxLength={500}
          returnKeyType="done"
          onEndEditing={commitNote}
          onSubmitEditing={commitNote}
        />
        <SettingsSection on={SHEET_GROUP}>
          {isDefault ? null : (
            <SettingsRow
              on={SHEET_GROUP}
              testID="sub-choice-make-default"
              title={t.subChoices.makeDefault}
              tone="accent"
              onPress={models.busy ? undefined : () => save(setSubDefault(sub, selection))}
            />
          )}
          <SettingsRow
            on={SHEET_GROUP}
            testID="sub-choice-remove"
            title={t.subChoices.remove}
            tone="danger"
            onPress={
              models.busy
                ? undefined
                : () => save(removeSubChoice(sub, selection), () => router.back())
            }
          />
        </SettingsSection>
      </View>
    </ScrollView>,
  );
}
