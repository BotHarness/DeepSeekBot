import { useId, type ReactElement, type ReactNode } from 'react';

import { Field, TextAreaField, TextField } from '../../ds/field.js';
import { SegmentedControl } from '../../ds/segmented.js';
import { Select } from '../../ds/select.js';
import type { BotHarnessTranslate } from '../../locale.js';
import type {
  VoiceRequestTemplate,
  VoiceTemplateValidation,
} from '@botharness/host-protocol/voice-request-template';
import {
  ASR_PLACEHOLDERS,
  buildTemplate,
  templateErrors,
  TTS_PLACEHOLDERS,
  type AuthKind,
  type BodyKind,
  type ResultKind,
  type TemplateDraft,
  type TemplateErrors,
  type TemplateKind,
} from './template-draft.js';
import { examplesFor } from './template-examples.js';

export const BLANK_EXAMPLE = 'blank';

const AUTH_KINDS: readonly AuthKind[] = ['bearer', 'header', 'query', 'none'];
const BODY_KINDS: readonly BodyKind[] = ['json', 'ssml', 'multipart', 'none'];
const TTS_RESULTS: readonly Exclude<ResultKind, 'text'>[] = ['audio', 'base64', 'hex', 'url'];

export interface TemplateExamplePicker {
  readonly value: string;
  onChange(id: string): void;
}

export function TemplateFields({
  kind,
  draft,
  errors,
  example,
  keyField,
  t,
  onChange,
}: {
  readonly kind: TemplateKind;
  readonly draft: TemplateDraft;
  readonly errors: TemplateErrors;
  readonly example?: TemplateExamplePicker | undefined;
  readonly keyField?: ReactNode;
  readonly t: BotHarnessTranslate;
  onChange(next: TemplateDraft): void;
}): ReactElement {
  const id = useId();
  const set = (patch: Partial<TemplateDraft>) => onChange({ ...draft, ...patch });
  const placeholders = (kind === 'tts' ? TTS_PLACEHOLDERS : ASR_PLACEHOLDERS).join(' ');
  return (
    <>
      {example === undefined ? null : (
        <Field label={t('voice.template.example')} group>
          {() => (
            <span data-voice-template-example="">
              <Select
                label={t('voice.template.example')}
                value={example.value}
                options={[
                  { value: BLANK_EXAMPLE, label: t('voice.template.exampleBlank') },
                  ...examplesFor(kind).map((entry) => ({ value: entry.id, label: entry.name })),
                ]}
                onChange={example.onChange}
              />
            </span>
          )}
        </Field>
      )}
      <Field label={t('voice.template.method')} group error={errors.method}>
        {() => (
          <span data-voice-template-method="">
            <SegmentedControl
              id={`${id}-method`}
              label={t('voice.template.method')}
              value={draft.method}
              options={[
                { value: 'POST', label: 'POST' },
                { value: 'GET', label: 'GET' },
              ]}
              onChange={(method) =>
                set(method === 'GET' ? { method, bodyKind: 'none' } : { method })
              }
            />
          </span>
        )}
      </Field>
      <TextField
        label={t('voice.template.url')}
        hint={t('voice.template.urlHint')}
        error={errors.url}
        value={draft.url}
        monospace
        spellCheck={false}
        autoComplete="off"
        placeholder="https://api.example.com/v1/tts"
        data-voice-template-url=""
        onChange={(url) => set({ url })}
      />
      <Field label={t('voice.template.auth')} group error={errors.auth}>
        {() => (
          <span data-voice-template-auth="">
            <Select
              label={t('voice.template.auth')}
              value={draft.auth}
              options={AUTH_KINDS.map((value) => ({
                value,
                label: t(`voice.template.auth.${value}`),
              }))}
              onChange={(auth) => set({ auth })}
            />
          </span>
        )}
      </Field>
      {draft.auth === 'header' ? (
        <>
          <TextField
            label={t('voice.template.authHeader')}
            error={errors.authName}
            value={draft.authName}
            monospace
            spellCheck={false}
            autoComplete="off"
            placeholder="X-API-Key"
            data-voice-template-auth-name=""
            onChange={(authName) => set({ authName })}
          />
          <TextField
            label={t('voice.template.authPrefix')}
            hint={t('voice.template.authPrefixHint')}
            error={errors.authPrefix}
            value={draft.authPrefix}
            monospace
            spellCheck={false}
            autoComplete="off"
            data-voice-template-auth-prefix=""
            onChange={(authPrefix) => set({ authPrefix })}
          />
        </>
      ) : draft.auth === 'query' ? (
        <TextField
          label={t('voice.template.authQuery')}
          error={errors.authName}
          value={draft.authName}
          monospace
          spellCheck={false}
          autoComplete="off"
          placeholder="key"
          data-voice-template-auth-name=""
          onChange={(authName) => set({ authName })}
        />
      ) : null}
      {keyField}
      <TextAreaField
        label={t('voice.template.headers')}
        hint={t('voice.template.headersHint')}
        error={errors.headers}
        value={draft.headers}
        rows={2}
        monospace
        spellCheck={false}
        placeholder="{}"
        data-voice-template-headers=""
        onChange={(headers) => set({ headers })}
      />
      <Field
        label={t('voice.template.body')}
        group
        error={draft.bodyKind === 'none' ? errors.body : undefined}
      >
        {() => (
          <span data-voice-template-body-kind="">
            <SegmentedControl
              id={`${id}-body`}
              label={t('voice.template.body')}
              value={draft.bodyKind}
              options={BODY_KINDS.map((value) => ({
                value,
                label: t(`voice.template.body.${value}`),
                disabled: draft.method === 'GET' && value !== 'none',
              }))}
              onChange={(bodyKind) => set({ bodyKind })}
            />
          </span>
        )}
      </Field>
      {draft.bodyKind === 'none' ? null : (
        <TextAreaField
          label={t('voice.template.bodyText')}
          hint={t(`voice.template.bodyHint.${draft.bodyKind}`, { list: placeholders })}
          error={errors.body}
          value={draft.body}
          rows={8}
          monospace
          spellCheck={false}
          data-voice-template-body=""
          onChange={(body) => set({ body })}
        />
      )}
      {kind === 'tts' ? (
        <Field label={t('voice.template.result')} group error={errors.result}>
          {() => (
            <span data-voice-template-result="">
              <Select
                label={t('voice.template.result')}
                value={draft.resultKind}
                options={TTS_RESULTS.map((value) => ({
                  value,
                  label: t(`voice.template.result.${value}`),
                }))}
                onChange={(resultKind) => set({ resultKind })}
              />
            </span>
          )}
        </Field>
      ) : null}
      {draft.resultKind === 'audio' ? null : (
        <TextField
          label={kind === 'asr' ? t('voice.template.textPath') : t('voice.template.resultPath')}
          hint={t('voice.template.resultPathHint')}
          error={errors.resultPath ?? (kind === 'asr' ? errors.result : undefined)}
          value={draft.resultPath}
          monospace
          spellCheck={false}
          autoComplete="off"
          placeholder={kind === 'asr' ? 'text' : 'audioContent'}
          data-voice-template-result-path=""
          onChange={(resultPath) => set({ resultPath })}
        />
      )}
    </>
  );
}

export type TemplateCheck =
  | { readonly ok: true; readonly template: VoiceRequestTemplate }
  | { readonly ok: false; readonly errors: TemplateErrors };

export async function checkTemplate(
  validate: (kind: TemplateKind, template: unknown) => Promise<VoiceTemplateValidation>,
  kind: TemplateKind,
  draft: TemplateDraft,
  t: BotHarnessTranslate,
): Promise<TemplateCheck> {
  const built = buildTemplate(draft, {
    invalidJson: t('voice.template.invalidJson'),
    expectObject: t('voice.template.expectObject'),
  });
  if (!built.ok) return built;
  const result = await validate(kind, built.template);
  return result.valid
    ? { ok: true, template: result.template }
    : { ok: false, errors: templateErrors(result.errors) };
}
