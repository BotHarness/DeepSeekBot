import type { ReactNode } from 'react';
import { View } from 'react-native';

import {
  placeholdersFor,
  TEMPLATE_AUTH_KINDS,
  TEMPLATE_BODY_KINDS,
  TTS_RESULT_KINDS,
  type BuildMessages,
  type TemplateDraft,
  type TemplateErrors,
  type TemplateKind,
} from '@botharness/host-client/shared/voice-template-draft';

import { SHEET_GROUP } from '../chat/sheet';
import { space } from '../design/tokens';
import { CreationField } from '../primitives/creation-field';
import { PreferenceRow } from '../primitives/preference-row';
import { Segmented } from '../primitives/segmented';
import { SettingsGroupItem } from '../primitives/settings-row';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';

export function useTemplateMessages(): BuildMessages {
  const t = useStrings().voiceSettings.template;
  return { invalidJson: t.invalidJson, expectObject: t.expectObject };
}

function Labeled({
  label,
  error,
  children,
}: {
  label: string;
  error?: string | undefined;
  children: ReactNode;
}) {
  return (
    <View style={{ gap: space.x2 }}>
      <Text strong>{label}</Text>
      {children}
      {error === undefined ? null : (
        <Text variant="meta" tone="danger">
          {error}
        </Text>
      )}
    </View>
  );
}

function feedback(error: string | undefined, hint?: string) {
  return error === undefined
    ? hint === undefined
      ? {}
      : { supportingText: hint }
    : { invalid: true, supportingText: error };
}

const CODE = { autoCapitalize: 'none', autoCorrect: false, spellCheck: false } as const;

export function VoiceTemplateFields({
  kind,
  draft,
  errors,
  keyField,
  onChange,
}: {
  kind: TemplateKind;
  draft: TemplateDraft;
  errors: TemplateErrors;
  keyField?: ReactNode;
  onChange(next: TemplateDraft): void;
}) {
  const t = useStrings().voiceSettings.template;
  const set = (patch: Partial<TemplateDraft>) => onChange({ ...draft, ...patch });
  const placeholders = placeholdersFor(kind).join(' ');
  const padded = { paddingHorizontal: space.x5, gap: space.x4 } as const;
  return (
    <>
      <View style={padded}>
        <Labeled label={t.method} error={errors.method}>
          <Segmented
            label={t.method}
            on={SHEET_GROUP}
            value={draft.method}
            options={[
              { value: 'POST', label: 'POST' },
              { value: 'GET', label: 'GET' },
            ]}
            onChange={(method) => set(method === 'GET' ? { method, bodyKind: 'none' } : { method })}
          />
        </Labeled>
        <CreationField
          testID="voice-template-url"
          accessibilityLabel={t.url}
          value={draft.url}
          keyboardType="url"
          placeholder="https://api.example.com/v1/tts"
          {...CODE}
          {...feedback(errors.url, t.urlHint)}
          onChangeText={(url) => set({ url })}
        />
      </View>
      <View>
        <SettingsGroupItem first last on={SHEET_GROUP}>
          <PreferenceRow
            on={SHEET_GROUP}
            title={t.auth}
            testID="voice-template-auth"
            value={draft.auth}
            options={TEMPLATE_AUTH_KINDS.map((value) => ({
              value,
              label: t.authKinds[value],
              icon: 'access' as const,
            }))}
            onChange={(auth) => set({ auth })}
          />
        </SettingsGroupItem>
        {errors.auth === undefined ? null : (
          <View style={{ paddingHorizontal: space.x5, paddingTop: space.x2 }}>
            <Text variant="meta" tone="danger">
              {errors.auth}
            </Text>
          </View>
        )}
      </View>
      <View style={padded}>
        {draft.auth === 'header' ? (
          <>
            <CreationField
              testID="voice-template-auth-name"
              accessibilityLabel={t.authHeader}
              value={draft.authName}
              placeholder="X-API-Key"
              {...CODE}
              {...feedback(errors.authName)}
              onChangeText={(authName) => set({ authName })}
            />
            <CreationField
              testID="voice-template-auth-prefix"
              accessibilityLabel={t.authPrefix}
              value={draft.authPrefix}
              {...CODE}
              {...feedback(errors.authPrefix, t.authPrefixHint)}
              onChangeText={(authPrefix) => set({ authPrefix })}
            />
          </>
        ) : draft.auth === 'query' ? (
          <CreationField
            testID="voice-template-auth-name"
            accessibilityLabel={t.authQuery}
            value={draft.authName}
            placeholder="key"
            {...CODE}
            {...feedback(errors.authName)}
            onChangeText={(authName) => set({ authName })}
          />
        ) : null}
        {keyField}
        <CreationField
          testID="voice-template-headers"
          accessibilityLabel={t.headers}
          value={draft.headers}
          multiline
          placeholder="{}"
          {...CODE}
          {...feedback(errors.headers, t.headersHint)}
          onChangeText={(headers) => set({ headers })}
        />
        {draft.method === 'GET' ? null : (
          <Labeled label={t.body} error={draft.bodyKind === 'none' ? errors.body : undefined}>
            <Segmented
              label={t.body}
              on={SHEET_GROUP}
              value={draft.bodyKind}
              options={TEMPLATE_BODY_KINDS.map((value) => ({ value, label: t.bodyKinds[value] }))}
              onChange={(bodyKind) => set({ bodyKind })}
            />
          </Labeled>
        )}
        {draft.bodyKind === 'none' ? null : (
          <CreationField
            testID="voice-template-body"
            accessibilityLabel={t.bodyText}
            value={draft.body}
            multiline
            {...CODE}
            {...feedback(errors.body, t.bodyHint[draft.bodyKind](placeholders))}
            onChangeText={(body) => set({ body })}
          />
        )}
      </View>
      {kind === 'tts' ? (
        <View>
          <SettingsGroupItem first last on={SHEET_GROUP}>
            <PreferenceRow
              on={SHEET_GROUP}
              title={t.result}
              testID="voice-template-result"
              value={draft.resultKind === 'text' ? 'audio' : draft.resultKind}
              options={TTS_RESULT_KINDS.map((value) => ({
                value,
                label: t.resultKinds[value],
                icon: 'voice' as const,
              }))}
              onChange={(resultKind) => set({ resultKind })}
            />
          </SettingsGroupItem>
          {errors.result === undefined ? null : (
            <View style={{ paddingHorizontal: space.x5, paddingTop: space.x2 }}>
              <Text variant="meta" tone="danger">
                {errors.result}
              </Text>
            </View>
          )}
        </View>
      ) : null}
      {draft.resultKind === 'audio' ? null : (
        <View style={padded}>
          <CreationField
            testID="voice-template-result-path"
            accessibilityLabel={kind === 'asr' ? t.textPath : t.resultPath}
            value={draft.resultPath}
            placeholder={kind === 'asr' ? 'text' : 'audioContent'}
            {...CODE}
            {...feedback(
              errors.resultPath ?? (kind === 'asr' ? errors.result : undefined),
              t.resultPathHint,
            )}
            onChangeText={(resultPath) => set({ resultPath })}
          />
        </View>
      )}
    </>
  );
}
